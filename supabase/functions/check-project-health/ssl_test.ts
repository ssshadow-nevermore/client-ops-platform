/// <reference lib="deno.ns" />

import {
  checkSslTarget,
  createUnknownSslResult,
  resolveFinalSslTarget,
  type TlsConnect,
  type TlsConnectOptions,
  type TlsPeerCertificate,
  type TlsPeerX509Certificate,
  toPublicSslFields,
  toSafeSslResult,
} from "./ssl.ts";
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
): void {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function createTarget(
  url = "https://example.com/",
  addresses = ["93.184.216.34"],
): ResolvedProductionTarget {
  return {
    url: new URL(url),
    addresses,
  };
}

function createSocket(
  certificate: TlsPeerCertificate | null,
  options: {
    authorized?: boolean;
    authorizationError?: string | null;
    onTimeout?: () => void;
    x509?: {
      certificate?: TlsPeerX509Certificate | null;
      error?: unknown;
    };
  } = {},
) {
  let errorListener: ((error: unknown) => void) | undefined;
  let destroyed = false;
  const x509Options = options.x509;

  return {
    get destroyed() {
      return destroyed;
    },
    authorized: options.authorized ?? true,
    authorizationError: options.authorizationError ?? null,
    getPeerCertificate: () => certificate,
    ...(x509Options
      ? {
        getPeerX509Certificate: () => {
          if ("error" in x509Options) {
            throw x509Options.error;
          }

          return x509Options.certificate ?? null;
        },
      }
      : {}),
    setTimeout: (_timeout: number, callback: () => void) => {
      options.onTimeout = callback;
    },
    once: (_event: "error", listener: (error: unknown) => void) => {
      errorListener = listener;
    },
    destroy: () => {
      destroyed = true;
    },
    emitError: (error: unknown) => errorListener?.(error),
    emitTimeout: () => options.onTimeout?.(),
  };
}

function certificateConnect(
  validTo: string,
  capture?: (options: TlsConnectOptions) => void,
  socketOptions?: Parameters<typeof createSocket>[1],
): TlsConnect {
  return (options, callback) => {
    capture?.(options);
    const socket = createSocket(
      { valid_to: validTo },
      socketOptions,
    );
    queueMicrotask(callback);
    return socket;
  };
}

function errorConnect(
  error: unknown,
  capture?: (options: TlsConnectOptions) => void,
): TlsConnect {
  return (options) => {
    capture?.(options);
    const socket = createSocket({});
    queueMicrotask(() => socket.emitError(error));
    return socket;
  };
}

const fixedNow = () => new Date("2026-08-30T00:00:00.000Z");

Deno.test("valid certificate with more than 30 days remaining is healthy", async () => {
  const result = await checkSslTarget(
    createTarget(),
    certificateConnect("2026-10-01T00:00:00.000Z"),
    fixedNow,
  );

  assertEquals(result.status, "healthy");
  assertEquals(result.daysRemaining, 32);
});

Deno.test("valid certificate with 8 to 30 days remaining is degraded", async () => {
  const result = await checkSslTarget(
    createTarget(),
    certificateConnect("2026-09-18T00:00:00.000Z"),
    fixedNow,
  );

  assertEquals(result.status, "degraded");
  assertEquals(result.daysRemaining, 19);
});

Deno.test("valid certificate with 7 or fewer days remaining is critical", async () => {
  const result = await checkSslTarget(
    createTarget(),
    certificateConnect("2026-09-06T00:00:00.000Z"),
    fixedNow,
  );

  assertEquals(result.status, "critical");
  assertEquals(result.daysRemaining, 7);
});

Deno.test("expired certificate is critical", async () => {
  const result = await checkSslTarget(
    createTarget(),
    certificateConnect("2026-08-29T00:00:00.000Z"),
    fixedNow,
  );

  assertEquals(result.status, "critical");
  assertEquals(result.daysRemaining, 0);
});

Deno.test("X509 validToDate is used for certificate expiry", async () => {
  const result = await checkSslTarget(
    createTarget(),
    certificateConnect(
      "invalid-legacy-expiry",
      undefined,
      {
        x509: {
          certificate: {
            validToDate: new Date("2026-10-01T00:00:00.000Z"),
          },
        },
      },
    ),
    fixedNow,
  );

  assertEquals(result.status, "healthy");
  assertEquals(result.expiresAt, "2026-10-01T00:00:00.000Z");
});

Deno.test("X509 validTo is used for certificate expiry", async () => {
  const result = await checkSslTarget(
    createTarget(),
    certificateConnect(
      "invalid-legacy-expiry",
      undefined,
      {
        x509: {
          certificate: {
            validTo: "2026-09-18T00:00:00.000Z",
          },
        },
      },
    ),
    fixedNow,
  );

  assertEquals(result.status, "degraded");
  assertEquals(result.expiresAt, "2026-09-18T00:00:00.000Z");
});

Deno.test("legacy certificate expiry is used when X509 API is unavailable", async () => {
  const result = await checkSslTarget(
    createTarget(),
    certificateConnect("2026-10-01T00:00:00.000Z"),
    fixedNow,
  );

  assertEquals(result.status, "healthy");
  assertEquals(result.expiresAt, "2026-10-01T00:00:00.000Z");
});

Deno.test("legacy certificate expiry is used when X509 API throws", async () => {
  const result = await checkSslTarget(
    createTarget(),
    certificateConnect(
      "2026-10-01T00:00:00.000Z",
      undefined,
      { x509: { error: new Error("X509 metadata unavailable") } },
    ),
    fixedNow,
  );

  assertEquals(result.status, "healthy");
  assertEquals(result.expiresAt, "2026-10-01T00:00:00.000Z");
});

Deno.test("legacy certificate expiry is used when X509 expiry is absent", async () => {
  const result = await checkSslTarget(
    createTarget(),
    certificateConnect(
      "2026-10-01T00:00:00.000Z",
      undefined,
      { x509: { certificate: { subject: { commonName: "example.com" } } } },
    ),
    fixedNow,
  );

  assertEquals(result.status, "healthy");
  assertEquals(result.expiresAt, "2026-10-01T00:00:00.000Z");
});

Deno.test("invalid X509 validToDate falls back to legacy expiry", async () => {
  const result = await checkSslTarget(
    createTarget(),
    certificateConnect(
      "2026-10-01T00:00:00.000Z",
      undefined,
      {
        x509: {
          certificate: {
            validToDate: new Date("invalid"),
          },
        },
      },
    ),
    fixedNow,
  );

  assertEquals(result.status, "healthy");
  assertEquals(result.expiresAt, "2026-10-01T00:00:00.000Z");
});

Deno.test("both certificate expiry sources missing remain unknown", async () => {
  const tlsConnect: TlsConnect = (_options, callback) => {
    const socket = createSocket(
      { subject: { commonName: "example.com" } },
      { x509: { certificate: { subject: { commonName: "example.com" } } } },
    );
    queueMicrotask(callback);
    return socket;
  };

  const result = await checkSslTarget(
    createTarget(),
    tlsConnect,
    fixedNow,
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.expiresAt, null);
  assertEquals(result.diagnosticReason, "certificate_expiry_missing");
  assertEquals(result.diagnosticCode, null);
});

Deno.test("final HTTP URL is critical and does not attempt TLS", async () => {
  let connectCalled = false;
  const tlsConnect: TlsConnect = () => {
    connectCalled = true;
    throw new Error("TLS must not run for HTTP");
  };

  const result = await checkSslTarget(
    createTarget("http://example.com/"),
    tlsConnect,
    fixedNow,
  );

  assertEquals(result.status, "critical");
  assertEquals(result.expiresAt, null);
  assert(!connectCalled, "HTTP target must not create a TLS connection");
});

Deno.test("untrusted certificate is critical", async () => {
  const result = await checkSslTarget(
    createTarget(),
    errorConnect({ code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" }),
    fixedNow,
  );

  assertEquals(result.status, "critical");
  assertEquals(result.expiresAt, null);
  assertEquals(result.diagnosticReason, undefined);
  assertEquals(result.diagnosticCode, undefined);
});

Deno.test("hostname and certificate mismatch is critical", async () => {
  const result = await checkSslTarget(
    createTarget(),
    errorConnect({ code: "ERR_TLS_CERT_ALTNAME_INVALID" }),
    fixedNow,
  );

  assertEquals(result.status, "critical");
});

Deno.test("certificate not yet valid is critical", async () => {
  const result = await checkSslTarget(
    createTarget(),
    errorConnect({ code: "CERT_NOT_YET_VALID" }),
    fixedNow,
  );

  assertEquals(result.status, "critical");
});

Deno.test("revoked certificate is critical", async () => {
  const result = await checkSslTarget(
    createTarget(),
    errorConnect({ code: "CERT_REVOKED" }),
    fixedNow,
  );

  assertEquals(result.status, "critical");
});

Deno.test("invalid CA certificate is critical", async () => {
  const result = await checkSslTarget(
    createTarget(),
    errorConnect({ code: "INVALID_CA" }),
    fixedNow,
  );

  assertEquals(result.status, "critical");
});

Deno.test("timeout or transient network inability is unknown", async () => {
  const socket = createSocket({});
  const tlsConnect: TlsConnect = () => {
    queueMicrotask(() => socket.emitError({ code: "ECONNRESET" }));
    return socket;
  };

  const result = await checkSslTarget(
    createTarget(),
    tlsConnect,
    fixedNow,
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.diagnosticReason, "tls_socket_error");
  assertEquals(result.diagnosticCode, "ECONNRESET");
});

Deno.test("ECONNRESET remains an unknown SSL result", async () => {
  const result = await checkSslTarget(
    createTarget(),
    errorConnect({ code: "ECONNRESET" }),
    fixedNow,
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.diagnosticReason, "tls_socket_error");
  assertEquals(result.diagnosticCode, "ECONNRESET");
});

Deno.test("ETIMEDOUT remains an unknown SSL result", async () => {
  const result = await checkSslTarget(
    createTarget(),
    errorConnect({ code: "ETIMEDOUT" }),
    fixedNow,
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.diagnosticReason, "tls_socket_error");
  assertEquals(result.diagnosticCode, "ETIMEDOUT");
});

Deno.test("TLS timeout is unknown and closes the socket", async () => {
  const socket = createSocket({});
  const tlsConnect: TlsConnect = () => {
    queueMicrotask(() => socket.emitTimeout());
    return socket;
  };

  const result = await checkSslTarget(
    createTarget(),
    tlsConnect,
    fixedNow,
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.diagnosticReason, "tls_timeout");
  assertEquals(result.diagnosticCode, null);
  assert(socket.destroyed, "timed out TLS socket must be destroyed");
});

Deno.test("missing peer certificate is unknown with a stable reason", async () => {
  const tlsConnect: TlsConnect = (_options, callback) => {
    const socket = createSocket({});
    queueMicrotask(callback);
    return socket;
  };

  const result = await checkSslTarget(
    createTarget(),
    tlsConnect,
    fixedNow,
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.diagnosticReason, "peer_certificate_missing");
  assertEquals(result.diagnosticCode, null);
});

Deno.test("missing certificate expiry metadata is unknown with a stable reason", async () => {
  const tlsConnect: TlsConnect = (_options, callback) => {
    const socket = createSocket({ subject: { commonName: "example.com" } });
    queueMicrotask(callback);
    return socket;
  };

  const result = await checkSslTarget(
    createTarget(),
    tlsConnect,
    fixedNow,
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.expiresAt, null);
  assertEquals(result.diagnosticReason, "certificate_expiry_missing");
  assertEquals(result.diagnosticCode, null);
});

Deno.test("SSL diagnostics are stripped from persistence and public projections", () => {
  const internalResult = createUnknownSslResult(
    "tls_socket_error",
    "ECONNRESET",
  );

  const safeResult = toSafeSslResult(internalResult);
  const publicFields = toPublicSslFields(safeResult);

  assertEquals(safeResult.status, "unknown");
  assertEquals(safeResult.expiresAt, null);
  assertEquals(publicFields.sslStatus, "unknown");
  assertEquals(publicFields.sslExpiresAt, null);
  assert(
    !("diagnosticReason" in safeResult),
    "diagnostic reason must not be persisted",
  );
  assert(
    !("diagnosticCode" in safeResult),
    "diagnostic code must not be persisted",
  );
  assert(
    !("diagnosticReason" in publicFields),
    "diagnostic reason must not be public",
  );
  assert(
    !("diagnosticCode" in publicFields),
    "diagnostic code must not be public",
  );
});

Deno.test("TLS connects to the validated IP and uses the hostname only for SNI and verification", async () => {
  const capturedOptions: { value?: TlsConnectOptions } = {};

  const result = await checkSslTarget(
    createTarget(),
    certificateConnect(
      "2026-10-01T00:00:00.000Z",
      (options) => {
        capturedOptions.value = options;
      },
    ),
    fixedNow,
  );

  assertEquals(result.status, "healthy");
  const hostnameOptions = capturedOptions.value;
  assert(hostnameOptions, "TLS options were not captured");
  assertEquals(hostnameOptions.host, "93.184.216.34");
  assertEquals(hostnameOptions.servername, "example.com");
  assertEquals(hostnameOptions.port, 443);
  assertEquals(hostnameOptions.rejectUnauthorized, true);
  assert(
    typeof hostnameOptions.checkServerIdentity === "function",
    "hostname verification must remain enabled",
  );

  const literalIpCaptured: { value?: TlsConnectOptions } = {};

  await checkSslTarget(
    createTarget("https://93.184.216.34/"),
    certificateConnect(
      "2026-10-01T00:00:00.000Z",
      (options) => {
        literalIpCaptured.value = options;
      },
    ),
    fixedNow,
  );

  const literalIpOptions = literalIpCaptured.value;
  assert(literalIpOptions, "TLS options for literal IP were not captured");
  assertEquals(literalIpOptions.host, "93.184.216.34");
  assertEquals(literalIpOptions.servername, undefined);
  assert(
    typeof literalIpOptions.checkServerIdentity === "function",
    "literal IP verification must remain enabled",
  );
});

Deno.test("TLS connection is destroyed after certificate inspection", async () => {
  const socket = createSocket({
    valid_to: "2026-10-01T00:00:00.000Z",
  });
  const tlsConnect: TlsConnect = (_options, callback) => {
    queueMicrotask(callback);
    return socket;
  };

  await checkSslTarget(
    createTarget(),
    tlsConnect,
    fixedNow,
  );

  assert(socket.destroyed, "TLS socket must be destroyed after the check");
});

Deno.test("redirected HTTPS hostname is resolved again through SSRF validation", async () => {
  let validationCalls = 0;

  const finalTarget = await resolveFinalSslTarget(
    createTarget("https://origin.example/", ["93.184.216.34"]),
    "https://final.example/health",
    (rawUrl) => {
      validationCalls += 1;
      assertEquals(rawUrl, "https://final.example/health");
      return Promise.resolve(
        createTarget(
          rawUrl,
          ["93.184.216.35"],
        ),
      );
    },
  );

  assertEquals(validationCalls, 1);
  assertEquals(finalTarget.url.hostname, "final.example");
  assertEquals(finalTarget.addresses[0], "93.184.216.35");
});
