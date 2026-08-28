/// <reference lib="deno.ns" />

import {
  type ResolvedProductionTarget,
  UnsafeTargetError,
  validateAndResolveProductionUrl,
} from "./target.ts";

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 10_000;

const REDIRECT_STATUSES = new Set([
  301,
  302,
  303,
  307,
  308,
]);

export type HttpCheckResult = {
  finalUrl: string;
  statusCode: number;
  responseTimeMs: number;
  redirectCount: number;
};

export class HttpCheckError extends Error {
  readonly code:
    | "timeout"
    | "network_error"
    | "redirect_limit"
    | "invalid_redirect";

  constructor(
    code: HttpCheckError["code"],
    message: string,
  ) {
    super(message);
    this.name = "HttpCheckError";
    this.code = code;
  }
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

function nowMs(): number {
  return performance.now();
}

export async function checkHttpTarget(
  initialTarget: ResolvedProductionTarget,
  fetchImpl: FetchLike = fetch,
): Promise<HttpCheckResult> {
  let currentTarget = initialTarget;
  let redirectCount = 0;

  const startedAt = nowMs();

  while (true) {
    /*
     * Revalidate the current hostname immediately before every
     * outbound request.
     *
     * Redirect targets therefore pass through the same SSRF
     * validation as the original production URL.
     */
    try {
      currentTarget = await validateAndResolveProductionUrl(
        currentTarget.url.toString(),
      );
    } catch (error) {
      if (error instanceof UnsafeTargetError) {
        throw new HttpCheckError(
          "invalid_redirect",
          error.message,
        );
      }

      throw error;
    }

    const controller = new AbortController();

    const timeoutId = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    let response: Response;

    try {
      response = await fetchImpl(
        currentTarget.url,
        {
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "Accept": "*/*",
            "Cache-Control": "no-cache",
            "Range": "bytes=0-0",
            "User-Agent": "ClientOps-HealthCheck/1.0",
          },
        },
      );
    } catch (error) {
      if (controller.signal.aborted) {
        throw new HttpCheckError(
          "timeout",
          "HTTP health check timed out",
        );
      }

      console.error("HTTP health request failed", {
        url: currentTarget.url.toString(),
        error,
      });

      throw new HttpCheckError(
        "network_error",
        "Unable to reach production URL",
      );
    } finally {
      clearTimeout(timeoutId);
    }

    /*
     * We only need headers/status for Health v1.
     * Do not download the whole website body.
     */
    if (response.body) {
      await response.body.cancel().catch(() => {
        // Body cancellation is best effort only.
      });
    }

    if (!isRedirectStatus(response.status)) {
      return {
        finalUrl: currentTarget.url.toString(),
        statusCode: response.status,
        responseTimeMs: Math.max(
          0,
          Math.round(nowMs() - startedAt),
        ),
        redirectCount,
      };
    }

    const location = response.headers.get("Location");

    if (!location) {
      /*
       * A redirect status without Location cannot be followed.
       * Treat the response itself as the final HTTP result.
       */
      return {
        finalUrl: currentTarget.url.toString(),
        statusCode: response.status,
        responseTimeMs: Math.max(
          0,
          Math.round(nowMs() - startedAt),
        ),
        redirectCount,
      };
    }

    redirectCount += 1;

    if (redirectCount > MAX_REDIRECTS) {
      throw new HttpCheckError(
        "redirect_limit",
        "Too many HTTP redirects",
      );
    }

    let redirectUrl: URL;

    try {
      redirectUrl = new URL(
        location,
        currentTarget.url,
      );
    } catch {
      throw new HttpCheckError(
        "invalid_redirect",
        "Redirect URL is invalid",
      );
    }

    try {
      currentTarget = await validateAndResolveProductionUrl(
        redirectUrl.toString(),
      );
    } catch (error) {
      if (error instanceof UnsafeTargetError) {
        throw new HttpCheckError(
          "invalid_redirect",
          `Unsafe redirect target: ${error.message}`,
        );
      }

      throw error;
    }
  }
}
