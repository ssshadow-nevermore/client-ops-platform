/// <reference lib="deno.ns" />

import {
  checkSslTargetWithConfiguredTransport,
  type RemoteSslProbeConfig,
} from "./remote-ssl.ts";
import type { SslCheckResult } from "./ssl.ts";
import type { ResolvedProductionTarget } from "./target.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(
  actual: T,
  expected: T,
  message = "Values are not equal",
) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function createTarget(
  url = "https://origin.example/",
  addresses = ["93.184.216.34"],
): ResolvedProductionTarget {
  return {
    url: new URL(url),
    addresses,
  };
}

const config: RemoteSslProbeConfig = {
  url: "https://probe.internal/api/ssl",
  secret: "test-probe-secret",
};

const fixedNow = () => new Date("2026-08-30T00:00:00.000Z");

Deno.test("configured remote probe classifies a verified expiry", async () => {
  const captured = {
    requestUrl: "",
    requestBody: null as Record<string, unknown> | null,
    authorization: "",
  };

  const result = await checkSslTargetWithConfiguredTransport(
    createTarget(),
    config,
    {
      fetchImpl: (input, init) => {
        captured.requestUrl = input;
        captured.requestBody = JSON.parse(String(init?.body));
        captured.authorization = String(
          init?.headers instanceof Headers
            ? init.headers.get("Authorization")
            : (init?.headers as Record<string, string>).Authorization,
        );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              outcome: "verified",
              expiresAt: "2026-10-01T00:00:00.000Z",
            }),
            { status: 200 },
          ),
        );
      },
      now: fixedNow,
    },
  );

  assertEquals(result.status, "healthy");
  assertEquals(result.expiresAt, "2026-10-01T00:00:00.000Z");
  assertEquals(captured.requestUrl, config.url);
  assert(captured.requestBody, "remote request body was not captured");
  assertEquals(captured.requestBody.hostname, "origin.example");
  assertEquals(
    JSON.stringify(captured.requestBody.addresses),
    JSON.stringify(["93.184.216.34"]),
  );
  assertEquals(captured.authorization, `Bearer ${config.secret}`);
});

Deno.test("remote certificate_error becomes critical", async () => {
  const result = await checkSslTargetWithConfiguredTransport(
    createTarget(),
    config,
    {
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              outcome: "certificate_error",
              code: "CERT_HAS_EXPIRED",
            }),
            { status: 200 },
          ),
        ),
    },
  );

  assertEquals(result.status, "critical");
  assertEquals(result.expiresAt, null);
});

Deno.test("invalid certificate_error code becomes unknown", async () => {
  const result = await checkSslTargetWithConfiguredTransport(
    createTarget(),
    config,
    {
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              outcome: "certificate_error",
              code: "raw-error-details",
            }),
            { status: 200 },
          ),
        ),
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.diagnosticReason, "ssl_probe_invalid_response");
});

Deno.test("invalid verified expiry becomes unknown", async () => {
  const result = await checkSslTargetWithConfiguredTransport(
    createTarget(),
    config,
    {
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              outcome: "verified",
              expiresAt: "not-a-date",
            }),
            { status: 200 },
          ),
        ),
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.diagnosticReason, "ssl_probe_invalid_response");
});

Deno.test("invalid unknown code becomes unknown", async () => {
  const result = await checkSslTargetWithConfiguredTransport(
    createTarget(),
    config,
    {
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              outcome: "unknown",
              reason: "tls_timeout",
              code: "raw-error-details",
            }),
            { status: 200 },
          ),
        ),
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.diagnosticReason, "ssl_probe_invalid_response");
});

Deno.test("remote unknown result remains unknown", async () => {
  const result = await checkSslTargetWithConfiguredTransport(
    createTarget(),
    config,
    {
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              outcome: "unknown",
              reason: "certificate_expiry_missing",
              code: null,
            }),
            { status: 200 },
          ),
        ),
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.expiresAt, null);
  assertEquals(result.diagnosticReason, "certificate_expiry_missing");
});

Deno.test("remote worker timeout becomes unknown instead of HTTP failure", async () => {
  const result = await checkSslTargetWithConfiguredTransport(
    createTarget(),
    config,
    {
      timeoutMs: 1,
      fetchImpl: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new Error("worker timeout"));
          });
        }),
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.diagnosticReason, "ssl_probe_timeout");
});

Deno.test("remote worker network error becomes unknown with a safe code", async () => {
  const result = await checkSslTargetWithConfiguredTransport(
    createTarget(),
    config,
    {
      fetchImpl: () =>
        Promise.reject({ code: "ECONNRESET", message: "raw worker error" }),
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.diagnosticReason, "ssl_probe_request_error");
  assertEquals(result.diagnosticCode, "ECONNRESET");
});

Deno.test("malformed remote JSON becomes unknown", async () => {
  const result = await checkSslTargetWithConfiguredTransport(
    createTarget(),
    config,
    {
      fetchImpl: () =>
        Promise.resolve(new Response("not-json", { status: 200 })),
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.diagnosticReason, "ssl_probe_invalid_response");
});

Deno.test("remote redirect rejection becomes unknown", async () => {
  const result = await checkSslTargetWithConfiguredTransport(
    createTarget(),
    config,
    {
      fetchImpl: () =>
        Promise.reject(new TypeError("redirect target is not accepted")),
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.diagnosticReason, "ssl_probe_request_error");
});

Deno.test("worker secret is not included in the request body or result", async () => {
  let requestBody = "";

  const result = await checkSslTargetWithConfiguredTransport(
    createTarget(),
    config,
    {
      fetchImpl: (_input, init) => {
        requestBody = String(init?.body);
        return Promise.resolve(
          new Response(
            JSON.stringify({
              outcome: "unknown",
              reason: "tls_timeout",
              code: null,
            }),
            { status: 200 },
          ),
        );
      },
    },
  );

  assert(
    !requestBody.includes(config.secret),
    "secret leaked into request body",
  );
  assert(
    !JSON.stringify(result).includes(config.secret),
    "secret leaked into result",
  );
});

Deno.test("worker URL comes only from configured transport", async () => {
  let requestUrl = "";

  await checkSslTargetWithConfiguredTransport(
    createTarget("https://project-controlled.example/"),
    config,
    {
      fetchImpl: (input) => {
        requestUrl = input;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              outcome: "unknown",
              reason: "tls_timeout",
              code: null,
            }),
            { status: 200 },
          ),
        );
      },
    },
  );

  assertEquals(requestUrl, config.url);
  assert(
    !requestUrl.includes("project-controlled.example"),
    "project URL leaked into worker URL",
  );
});

Deno.test("HTTP final target never calls the remote worker", async () => {
  let workerCalled = false;
  let directCalled = false;
  const directResult: SslCheckResult = {
    status: "critical",
    expiresAt: null,
    daysRemaining: null,
  };

  const result = await checkSslTargetWithConfiguredTransport(
    createTarget("http://origin.example/"),
    config,
    {
      fetchImpl: () => {
        workerCalled = true;
        throw new Error("worker must not be called");
      },
      directCheck: () => {
        directCalled = true;
        return Promise.resolve(directResult);
      },
    },
  );

  assertEquals(result.status, "critical");
  assert(directCalled, "HTTP target should use direct semantics");
  assert(!workerCalled, "HTTP target must not call the worker");
});

Deno.test("missing remote configuration keeps direct TLS usable", async () => {
  let directCalled = false;

  const result = await checkSslTargetWithConfiguredTransport(
    createTarget(),
    null,
    {
      fetchImpl: () => {
        throw new Error("remote worker must not be called");
      },
      directCheck: () => {
        directCalled = true;
        return Promise.resolve({
          status: "unknown",
          expiresAt: null,
          daysRemaining: null,
          diagnosticReason: "certificate_expiry_missing",
          diagnosticCode: null,
        });
      },
    },
  );

  assertEquals(result.status, "unknown");
  assert(directCalled, "direct TLS should remain usable without worker config");
});

Deno.test("remote HTTP error becomes unknown without exposing response details", async () => {
  const result = await checkSslTargetWithConfiguredTransport(
    createTarget(),
    config,
    {
      fetchImpl: () =>
        Promise.resolve(new Response("secret worker details", { status: 503 })),
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.diagnosticReason, "ssl_probe_http_error");
  assert(
    !JSON.stringify(result).includes("secret worker details"),
    "worker error details leaked into result",
  );
});
