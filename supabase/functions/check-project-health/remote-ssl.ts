import {
  checkSslTarget,
  classifyCertificateExpiry,
  createUnknownSslResult,
  getSafeSslDiagnosticCode,
  isSafeSslCertificateCode,
  type SslCheckResult,
  type SslDiagnosticReason,
} from "./ssl.ts";
import type { ResolvedProductionTarget } from "./target.ts";

const REMOTE_SSL_PROBE_TIMEOUT_MS = 10_000;
const MAX_REMOTE_SSL_ADDRESSES = 3;

export type RemoteSslProbeConfig = {
  url: string;
  secret: string;
};

export type RemoteSslProbeFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type SslTransportOptions = {
  fetchImpl?: RemoteSslProbeFetch;
  directCheck?: (
    target: ResolvedProductionTarget,
  ) => Promise<SslCheckResult>;
  now?: () => Date;
  timeoutMs?: number;
};

type RemoteSslProbePayload = {
  outcome?: unknown;
  expiresAt?: unknown;
  reason?: unknown;
  code?: unknown;
};

const SAFE_REMOTE_REASONS = new Set<SslDiagnosticReason>([
  "tls_timeout",
  "tls_socket_error",
  "tls_not_authorized_unknown",
  "tls_socket_missing",
  "peer_certificate_error",
  "peer_certificate_missing",
  "certificate_expiry_missing",
  "tls_connect_throw",
  "tls_deadline_exceeded",
  "no_validated_addresses",
]);

function criticalSslResult(): SslCheckResult {
  return {
    status: "critical",
    expiresAt: null,
    daysRemaining: null,
  };
}

function isRemoteProbeUrlValid(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !parsed.username &&
      !parsed.password &&
      !parsed.hash
    );
  } catch {
    return false;
  }
}

function getFinalHostname(target: ResolvedProductionTarget): string {
  return target.url.hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

function isRecord(value: unknown): value is RemoteSslProbePayload {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: RemoteSslProbePayload, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isSafeNetworkCode(value: unknown): value is null | string {
  return value === null ||
    (typeof value === "string" &&
      getSafeSslDiagnosticCode({ code: value }) !== null);
}

function getRemoteUnknownReason(value: unknown): SslDiagnosticReason | null {
  return typeof value === "string" &&
      SAFE_REMOTE_REASONS.has(value as SslDiagnosticReason)
    ? value as SslDiagnosticReason
    : null;
}

function parseRemoteSslResponse(
  value: unknown,
  now: () => Date,
): SslCheckResult {
  if (!isRecord(value) || typeof value.outcome !== "string") {
    return createUnknownSslResult("ssl_probe_invalid_response");
  }

  if (value.outcome === "verified") {
    if (
      !hasOnlyKeys(value, ["outcome", "expiresAt"]) ||
      typeof value.expiresAt !== "string" ||
      value.expiresAt.length === 0 ||
      Number.isNaN(new Date(value.expiresAt).getTime())
    ) {
      return createUnknownSslResult("ssl_probe_invalid_response");
    }

    return classifyCertificateExpiry(value.expiresAt, now());
  }

  if (value.outcome === "certificate_error") {
    if (
      !hasOnlyKeys(value, ["outcome", "code"]) ||
      (value.code !== null && !isSafeSslCertificateCode(value.code))
    ) {
      return createUnknownSslResult("ssl_probe_invalid_response");
    }

    return criticalSslResult();
  }

  if (value.outcome === "unknown") {
    if (
      !hasOnlyKeys(value, ["outcome", "reason", "code"]) ||
      !isSafeNetworkCode(value.code)
    ) {
      return createUnknownSslResult("ssl_probe_invalid_response");
    }

    const reason = getRemoteUnknownReason(value.reason);
    if (!reason) {
      return createUnknownSslResult("ssl_probe_invalid_response");
    }

    return createUnknownSslResult(
      reason,
      getSafeSslDiagnosticCode({ code: value.code }),
    );
  }

  return createUnknownSslResult("ssl_probe_invalid_response");
}

async function checkWithRemoteSslProbe(
  target: ResolvedProductionTarget,
  config: RemoteSslProbeConfig,
  options: SslTransportOptions,
): Promise<SslCheckResult> {
  if (!isRemoteProbeUrlValid(config.url) || config.secret.length === 0) {
    return createUnknownSslResult("ssl_probe_configuration");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? REMOTE_SSL_PROBE_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hostname: getFinalHostname(target),
        addresses: target.addresses.slice(0, MAX_REMOTE_SSL_ADDRESSES),
      }),
      redirect: "error",
      signal: controller.signal,
    });

    if (!response.ok) {
      return createUnknownSslResult("ssl_probe_http_error");
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return createUnknownSslResult("ssl_probe_invalid_response");
    }

    return parseRemoteSslResponse(payload, options.now ?? (() => new Date()));
  } catch (error) {
    return createUnknownSslResult(
      controller.signal.aborted
        ? "ssl_probe_timeout"
        : "ssl_probe_request_error",
      getSafeSslDiagnosticCode(error),
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function checkSslTargetWithConfiguredTransport(
  target: ResolvedProductionTarget,
  config: RemoteSslProbeConfig | null,
  options: SslTransportOptions = {},
): Promise<SslCheckResult> {
  const directCheck = options.directCheck ?? checkSslTarget;

  if (target.url.protocol !== "https:" || !config) {
    return directCheck(target);
  }

  return checkWithRemoteSslProbe(target, config, options);
}
