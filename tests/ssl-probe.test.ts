import { afterEach, describe, expect, it } from "vitest";

import { GET, POST } from "../app/api/internal/health/ssl-probe/route";
import {
  probeSslCertificate,
  validateSslProbeInput,
  type SslProbeInput,
  type TlsConnect,
  type TlsConnectOptions,
  type TlsPeerCertificate,
  type TlsPeerX509Certificate,
  type TlsSocketLike,
} from "../lib/projects/ssl-probe";

type TestSocket = TlsSocketLike & {
  destroyed: boolean;
  emitError: (error: unknown) => void;
  emitTimeout: () => void;
};

function createSocket(
  certificate: TlsPeerCertificate | null,
  options: {
    authorized?: boolean;
    authorizationError?: unknown;
    x509?: {
      certificate?: TlsPeerX509Certificate | null;
      error?: unknown;
    };
  } = {},
): TestSocket {
  let errorListener: ((error: unknown) => void) | undefined;
  let timeoutListener: (() => void) | undefined;
  let destroyed = false;

  const socket: TestSocket = {
    get destroyed() {
      return destroyed;
    },
    authorized: options.authorized ?? true,
    authorizationError: options.authorizationError,
    getPeerCertificate: () => certificate,
    setTimeout: (_timeout: number, callback: () => void) => {
      timeoutListener = callback;
    },
    once: (_event: "error", listener: (error: unknown) => void) => {
      errorListener = listener;
    },
    destroy: () => {
      destroyed = true;
    },
    emitError: (error: unknown) => errorListener?.(error),
    emitTimeout: () => timeoutListener?.(),
  };

  if (options.x509) {
    const x509Options = options.x509;
    socket.getPeerX509Certificate = () => {
      if ("error" in x509Options) {
        throw x509Options.error;
      }

      return x509Options.certificate ?? null;
    };
  }

  return socket;
}

const validInput: SslProbeInput = {
  hostname: "example.com",
  addresses: ["93.184.216.34"],
};

function certificateConnect(
  legacyExpiry: string,
  options: Parameters<typeof createSocket>[1] = {},
  capture?: (options: TlsConnectOptions) => void,
): TlsConnect {
  return (tlsOptions, callback) => {
    capture?.(tlsOptions);
    const socket = createSocket({ valid_to: legacyExpiry }, options);
    queueMicrotask(callback);
    return socket;
  };
}

function errorConnect(error: unknown): TlsConnect {
  return () => {
    const socket = createSocket({});
    queueMicrotask(() => socket.emitError(error));
    return socket;
  };
}

const originalProbeSecret = process.env.HEALTH_PROBE_SECRET;

afterEach(() => {
  if (originalProbeSecret === undefined) {
    delete process.env.HEALTH_PROBE_SECRET;
  } else {
    process.env.HEALTH_PROBE_SECRET = originalProbeSecret;
  }
});

describe("internal SSL probe input and authentication", () => {
  it("rejects GET with method not allowed", async () => {
    const response = GET();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("fails closed when the worker secret is missing", async () => {
    delete process.env.HEALTH_PROBE_SECRET;

    const response = await POST(
      new Request("http://localhost/api/internal/health/ssl-probe", {
        method: "POST",
        headers: { Authorization: "Bearer any-secret" },
        body: JSON.stringify(validInput),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects a bad bearer token", async () => {
    process.env.HEALTH_PROBE_SECRET = "expected-secret";

    const response = await POST(
      new Request("http://localhost/api/internal/health/ssl-probe", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-secret" },
        body: JSON.stringify(validInput),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON after authentication", async () => {
    process.env.HEALTH_PROBE_SECRET = "expected-secret";

    const response = await POST(
      new Request("http://localhost/api/internal/health/ssl-probe", {
        method: "POST",
        headers: { Authorization: "Bearer expected-secret" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid request" });
  });

  it.each([
    null,
    [],
    { hostname: "example.com" },
    { hostname: "https://example.com", addresses: ["93.184.216.34"] },
    { hostname: "example.com/path", addresses: ["93.184.216.34"] },
  ])("rejects malformed probe input: %j", (input) => {
    expect(validateSslProbeInput(input)).toBeNull();
  });

  it.each([
    { addresses: [] as string[] },
    {
      addresses: [
        "93.184.216.34",
        "93.184.216.35",
        "93.184.216.36",
        "93.184.216.37",
      ],
    },
  ])("rejects an invalid address count: $addresses", ({ addresses }) => {
    expect(
      validateSslProbeInput({ hostname: "example.com", addresses }),
    ).toBeNull();
  });

  it.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.1.1",
    "192.168.1.1",
    "100.64.0.1",
    "224.0.0.1",
    "0.0.0.0",
    "203.0.113.10",
    "::1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
  ])("rejects non-public address %s", (address) => {
    expect(
      validateSslProbeInput({ hostname: "example.com", addresses: [address] }),
    ).toBeNull();
  });

  it("rejects ambiguous IPv4 spellings that Node would not treat as literals", () => {
    expect(
      validateSslProbeInput({
        hostname: "example.com",
        addresses: ["93.184.216.034"],
      }),
    ).toBeNull();
  });

  it("accepts public IPv4 and IPv6 addresses", () => {
    expect(
      validateSslProbeInput({
        hostname: "example.com",
        addresses: ["93.184.216.34", "2001:4860:4860::8888"],
      }),
    ).toEqual({
      hostname: "example.com",
      addresses: ["93.184.216.34", "2001:4860:4860::8888"],
    });
  });
});

describe("Node TLS certificate probe", () => {
  it("uses X509 validToDate and returns canonical ISO expiry", async () => {
    const result = await probeSslCertificate(validInput, {
      tlsConnect: certificateConnect("invalid-legacy-expiry", {
        x509: {
          certificate: {
            validToDate: new Date("2026-12-01T12:00:00.000Z"),
          },
        },
      }),
    });

    expect(result).toEqual({
      outcome: "verified",
      expiresAt: "2026-12-01T12:00:00.000Z",
    });
  });

  it("uses X509 validTo when validToDate is unavailable", async () => {
    const result = await probeSslCertificate(validInput, {
      tlsConnect: certificateConnect("invalid-legacy-expiry", {
        x509: { certificate: { validTo: "2026-12-01T00:00:00.000Z" } },
      }),
    });

    expect(result).toEqual({
      outcome: "verified",
      expiresAt: "2026-12-01T00:00:00.000Z",
    });
  });

  it("falls back to legacy valid_to when X509 API is unavailable", async () => {
    const result = await probeSslCertificate(validInput, {
      tlsConnect: certificateConnect("2026-12-01T00:00:00.000Z"),
    });

    expect(result).toEqual({
      outcome: "verified",
      expiresAt: "2026-12-01T00:00:00.000Z",
    });
  });

  it("falls back to legacy valid_to when X509 throws", async () => {
    const result = await probeSslCertificate(validInput, {
      tlsConnect: certificateConnect("2026-12-01T00:00:00.000Z", {
        x509: { error: new Error("raw X509 error must not escape") },
      }),
    });

    expect(result).toEqual({
      outcome: "verified",
      expiresAt: "2026-12-01T00:00:00.000Z",
    });
  });

  it("falls back to legacy valid_to when X509 expiry is missing", async () => {
    const result = await probeSslCertificate(validInput, {
      tlsConnect: certificateConnect("2026-12-01T00:00:00.000Z", {
        x509: { certificate: { subject: "not returned" } },
      }),
    });

    expect(result).toEqual({
      outcome: "verified",
      expiresAt: "2026-12-01T00:00:00.000Z",
    });
  });

  it("falls back when X509 validToDate is invalid", async () => {
    const result = await probeSslCertificate(validInput, {
      tlsConnect: certificateConnect("2026-12-01T00:00:00.000Z", {
        x509: { certificate: { validToDate: new Date("invalid") } },
      }),
    });

    expect(result).toEqual({
      outcome: "verified",
      expiresAt: "2026-12-01T00:00:00.000Z",
    });
  });

  it("returns verified expiry for an already expired certificate", async () => {
    const result = await probeSslCertificate(validInput, {
      tlsConnect: certificateConnect("2020-01-01T00:00:00.000Z"),
    });

    expect(result).toEqual({
      outcome: "verified",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
  });

  it.each(["CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID"])(
    "returns certificate_error for validation code %s",
    async (code) => {
      const result = await probeSslCertificate(validInput, {
        tlsConnect: errorConnect({ code }),
      });

      expect(result).toEqual({ outcome: "certificate_error", code });
    },
  );

  it("returns unknown for a TLS timeout", async () => {
    const socket = createSocket({});
    const resultPromise = probeSslCertificate(validInput, {
      timeoutMs: 10,
      tlsConnect: () => {
        queueMicrotask(() => socket.emitTimeout());
        return socket;
      },
    });

    const result = await resultPromise;
    expect(result).toEqual({
      outcome: "unknown",
      reason: "tls_timeout",
      code: null,
    });
    expect(socket.destroyed).toBe(true);
  });

  it("returns unknown with a safe code for a network error", async () => {
    const result = await probeSslCertificate(validInput, {
      tlsConnect: errorConnect({ code: "ECONNRESET", message: "not returned" }),
    });

    expect(result).toEqual({
      outcome: "unknown",
      reason: "tls_socket_error",
      code: "ECONNRESET",
    });
  });

  it("retries a second validated address after a transient error", async () => {
    const attemptedHosts: string[] = [];
    const sockets: TestSocket[] = [];
    const tlsConnect: TlsConnect = (options, callback) => {
      attemptedHosts.push(options.host);
      if (attemptedHosts.length === 1) {
        const socket = createSocket({});
        sockets.push(socket);
        queueMicrotask(() => socket.emitError({ code: "ECONNRESET" }));
        return socket;
      }

      const socket = createSocket({ valid_to: "2026-12-01T00:00:00.000Z" });
      sockets.push(socket);
      queueMicrotask(callback);
      return socket;
    };

    const result = await probeSslCertificate(
      {
        hostname: "example.com",
        addresses: ["93.184.216.34", "93.184.216.35"],
      },
      { tlsConnect },
    );

    expect(result).toEqual({
      outcome: "verified",
      expiresAt: "2026-12-01T00:00:00.000Z",
    });
    expect(attemptedHosts).toEqual(["93.184.216.34", "93.184.216.35"]);
    expect(sockets.every((socket) => socket.destroyed)).toBe(true);
  });

  it("connects to the validated IP and uses DNS hostname only for SNI", async () => {
    let capturedOptions: TlsConnectOptions | undefined;
    const result = await probeSslCertificate(validInput, {
      tlsConnect: certificateConnect(
        "2026-12-01T00:00:00.000Z",
        {},
        (options) => {
          capturedOptions = options;
        },
      ),
    });

    expect(result.outcome).toBe("verified");
    expect(capturedOptions?.host).toBe("93.184.216.34");
    expect(capturedOptions?.servername).toBe("example.com");
    expect(capturedOptions?.port).toBe(443);
    expect(capturedOptions?.rejectUnauthorized).toBe(true);
    expect(typeof capturedOptions?.checkServerIdentity).toBe("function");
  });

  it("does not send SNI for a literal IP while retaining verification", async () => {
    let capturedOptions: TlsConnectOptions | undefined;
    const result = await probeSslCertificate(
      {
        hostname: "93.184.216.34",
        addresses: ["93.184.216.34"],
      },
      {
        tlsConnect: certificateConnect(
          "2026-12-01T00:00:00.000Z",
          {},
          (options) => {
            capturedOptions = options;
          },
        ),
      },
    );

    expect(result.outcome).toBe("verified");
    expect(capturedOptions?.host).toBe("93.184.216.34");
    expect(capturedOptions?.servername).toBeUndefined();
    expect(typeof capturedOptions?.checkServerIdentity).toBe("function");
  });

  it("never returns target or certificate details in the response", async () => {
    const result = await probeSslCertificate(validInput, {
      tlsConnect: certificateConnect("2026-12-01T00:00:00.000Z", {
        x509: {
          certificate: {
            subject: "private subject",
            validTo: "2026-12-01T00:00:00.000Z",
          },
        },
      }),
    });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("example.com");
    expect(serialized).not.toContain("93.184.216.34");
    expect(serialized).not.toContain("private subject");
    expect(serialized).not.toContain("certificate");
  });
});
