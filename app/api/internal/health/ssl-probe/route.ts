import { timingSafeEqual } from "node:crypto";

import {
  probeSslCertificate,
  validateSslProbeInput,
} from "../../../../../lib/projects/ssl-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const jsonHeaders = {
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}

function unauthorizedResponse(): Response {
  return jsonResponse({ error: "Unauthorized" }, 401);
}

function hasValidBearerToken(request: Request): boolean {
  const expectedSecret = process.env.HEALTH_PROBE_SECRET;
  const authorization = request.headers.get("authorization");

  if (!expectedSecret || !authorization?.startsWith("Bearer ")) {
    return false;
  }

  const receivedSecret = authorization.slice("Bearer ".length);
  if (!receivedSecret) {
    return false;
  }

  const expectedBytes = Buffer.from(expectedSecret, "utf8");
  const receivedBytes = Buffer.from(receivedSecret, "utf8");

  if (expectedBytes.length !== receivedBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, receivedBytes);
}

export function GET(): Response {
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: {
      ...jsonHeaders,
      Allow: "POST",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!hasValidBearerToken(request)) {
    return unauthorizedResponse();
  }

  let body: unknown;

  try {
    const rawBody = await request.text();
    if (rawBody.length > 16_384) {
      return jsonResponse({ error: "Invalid request" }, 400);
    }

    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid request" }, 400);
  }

  const input = validateSslProbeInput(body);
  if (!input) {
    return jsonResponse({ error: "Invalid request" }, 400);
  }

  try {
    return jsonResponse(await probeSslCertificate(input), 200);
  } catch {
    return jsonResponse(
      {
        outcome: "unknown",
        reason: "tls_connect_throw",
        code: null,
      },
      200,
    );
  }
}
