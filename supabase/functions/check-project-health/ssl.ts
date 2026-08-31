/// <reference lib="deno.ns" />

import { checkServerIdentity, connect as connectTls } from "node:tls";
import ipaddr from "ipaddr.js";

import type { HealthStatus } from "./overall.ts";
import {
  type ResolvedProductionTarget,
  UnsafeTargetError,
  validateAndResolveProductionUrl,
} from "./target.ts";

const TLS_TIMEOUT_MS = 10_000;
const MAX_TLS_ADDRESSES = 3;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

const CERTIFICATE_ERROR_CODES = new Set([
  "CERT_CHAIN_TOO_LONG",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "CERT_REJECTED",
  "CERT_REVOKED",
  "CERT_SIGNATURE_FAILURE",
  "CERT_UNTRUSTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERROR_IN_CERT_NOT_AFTER_FIELD",
  "ERROR_IN_CERT_NOT_BEFORE_FIELD",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "HOSTNAME_MISMATCH",
  "INVALID_CA",
  "INVALID_PURPOSE",
  "PATH_LENGTH_EXCEEDED",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY",
  "UNABLE_TO_DECRYPT_CERT_SIGNATURE",
]);

export type SslCheckResult = {
  status: HealthStatus;
  expiresAt: string | null;
  daysRemaining: number | null;
  diagnosticReason?: SslDiagnosticReason;
  diagnosticCode?: string | null;
};

export type SslDiagnosticReason =
  | "tls_timeout"
  | "tls_socket_error"
  | "tls_not_authorized_unknown"
  | "tls_socket_missing"
  | "peer_certificate_error"
  | "peer_certificate_missing"
  | "certificate_expiry_missing"
  | "tls_connect_throw"
  | "tls_deadline_exceeded"
  | "no_validated_addresses"
  | "ssl_target_resolution_error";

export type TlsPeerCertificate = {
  subject?: unknown;
  valid_to?: string;
};

export type TlsPeerX509Certificate = {
  subject?: unknown;
  validTo?: string | null;
  validToDate?: Date | null;
};

export type TlsSocketLike = {
  authorized: boolean;
  authorizationError?: unknown;
  getPeerCertificate: () => TlsPeerCertificate | null;
  getPeerX509Certificate?: () => TlsPeerX509Certificate | null | undefined;
  setTimeout: (timeout: number, callback: () => void) => unknown;
  once: (
    event: "error",
    listener: (error: unknown) => void,
  ) => unknown;
  destroy: () => unknown;
};

export type TlsConnectOptions = {
  host: string;
  port: 443;
  servername?: string;
  rejectUnauthorized: true;
  checkServerIdentity: (
    hostname: string,
    certificate: unknown,
  ) => Error | undefined;
};

export type TlsConnect = (
  options: TlsConnectOptions,
  callback: () => void,
) => TlsSocketLike;

export type HealthClock = () => Date;

export type SafeSslResult = Pick<SslCheckResult, "status" | "expiresAt">;

export function toSafeSslResult(result: SslCheckResult): SafeSslResult {
  return {
    status: result.status,
    expiresAt: result.expiresAt,
  };
}

export function toPublicSslFields(result: SafeSslResult): {
  sslStatus: HealthStatus;
  sslExpiresAt: string | null;
} {
  return {
    sslStatus: result.status,
    sslExpiresAt: result.expiresAt,
  };
}

type CertificateExpiry = Date | string;

type CertificateExpiryResult =
  | { expiry: CertificateExpiry }
  | { reason: "peer_certificate_error"; error: unknown }
  | { reason: "peer_certificate_missing" }
  | { reason: "certificate_expiry_missing" };

type TlsProbeResult =
  | SslCheckResult
  | {
    status: "certificate_invalid" | "unknown";
    diagnosticReason?: SslDiagnosticReason;
    diagnosticCode?: string | null;
  };

const SAFE_DIAGNOSTIC_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTDOWN",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETRESET",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EAI_FAIL",
  "EAI_NODATA",
  "EAI_NONAME",
  "ENOTFOUND",
]);

function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

function getErrorCode(error: unknown): string | null {
  if (typeof error === "string") {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}

function isCertificateValidationError(error: unknown): boolean {
  const code = getErrorCode(error);

  return code !== null && CERTIFICATE_ERROR_CODES.has(code.toUpperCase());
}

export function getSafeSslDiagnosticCode(error: unknown): string | null {
  const code = getErrorCode(error)?.toUpperCase();

  return code !== undefined && SAFE_DIAGNOSTIC_CODES.has(code) ? code : null;
}

export function createUnknownSslResult(
  diagnosticReason: SslDiagnosticReason,
  diagnosticCode: string | null = null,
): SslCheckResult {
  return {
    status: "unknown",
    expiresAt: null,
    daysRemaining: null,
    diagnosticReason,
    diagnosticCode,
  };
}

function criticalResult(): SslCheckResult {
  return {
    status: "critical",
    expiresAt: null,
    daysRemaining: null,
  };
}

function extractCertificateExpiry(
  socket: TlsSocketLike,
): CertificateExpiryResult {
  // Hosted runtimes may support TLS verification while not exposing peer
  // certificate expiry metadata through Node compatibility APIs.
  let x509HasMetadata = false;

  if (typeof socket.getPeerX509Certificate === "function") {
    try {
      const x509 = socket.getPeerX509Certificate();

      if (x509 && Object.keys(x509).length > 0) {
        x509HasMetadata = true;
      }

      if (
        x509?.validToDate instanceof Date &&
        !Number.isNaN(x509.validToDate.getTime())
      ) {
        return { expiry: x509.validToDate };
      }

      if (typeof x509?.validTo === "string" && x509.validTo.length > 0) {
        return { expiry: x509.validTo };
      }
    } catch {
      // Fall back to the legacy certificate API below.
    }
  }

  let certificate: TlsPeerCertificate | null;

  try {
    certificate = socket.getPeerCertificate();
  } catch (error) {
    return { reason: "peer_certificate_error", error };
  }

  if (certificate && Object.keys(certificate).length > 0) {
    if (
      typeof certificate.valid_to === "string" &&
      certificate.valid_to.length > 0
    ) {
      return { expiry: certificate.valid_to };
    }

    return { reason: "certificate_expiry_missing" };
  }

  return {
    reason: x509HasMetadata
      ? "certificate_expiry_missing"
      : "peer_certificate_missing",
  };
}

export function classifyCertificateExpiry(
  validTo: CertificateExpiry,
  now: Date = new Date(),
): SslCheckResult {
  const expiresAt = validTo instanceof Date ? validTo : new Date(validTo);

  if (
    Number.isNaN(expiresAt.getTime()) ||
    Number.isNaN(now.getTime())
  ) {
    return createUnknownSslResult("certificate_expiry_missing");
  }

  const millisecondsRemaining = expiresAt.getTime() - now.getTime();
  const daysRemaining = Math.max(
    0,
    Math.ceil(millisecondsRemaining / MILLISECONDS_PER_DAY),
  );

  if (millisecondsRemaining <= 0) {
    return {
      status: "critical",
      expiresAt: expiresAt.toISOString(),
      daysRemaining,
    };
  }

  if (millisecondsRemaining > 30 * MILLISECONDS_PER_DAY) {
    return {
      status: "healthy",
      expiresAt: expiresAt.toISOString(),
      daysRemaining,
    };
  }

  if (millisecondsRemaining > 7 * MILLISECONDS_PER_DAY) {
    return {
      status: "degraded",
      expiresAt: expiresAt.toISOString(),
      daysRemaining,
    };
  }

  return {
    status: "critical",
    expiresAt: expiresAt.toISOString(),
    daysRemaining,
  };
}

function verifyHostname(
  hostname: string,
  certificate: unknown,
): Error | undefined {
  return checkServerIdentity(
    hostname,
    certificate as Parameters<typeof checkServerIdentity>[1],
  ) ?? undefined;
}

const defaultTlsConnect: TlsConnect = (options, callback) =>
  connectTls(options, callback);

function probeTlsAddress(
  hostname: string,
  address: string,
  timeoutMs: number,
  tlsConnect: TlsConnect,
  now: HealthClock,
): Promise<TlsProbeResult> {
  return new Promise((resolve) => {
    let socket: TlsSocketLike | null = null;
    let settled = false;

    const finish = (result: TlsProbeResult) => {
      if (settled) {
        return;
      }

      settled = true;

      try {
        socket?.destroy();
      } catch {
        // Socket cleanup is best effort after the result is determined.
      }

      resolve(result);
    };

    const onSocketError = (error: unknown) => {
      finish(
        isCertificateValidationError(error)
          ? { status: "certificate_invalid" }
          : {
            status: "unknown",
            diagnosticReason: "tls_socket_error",
            diagnosticCode: getSafeSslDiagnosticCode(error),
          },
      );
    };

    try {
      const isIpLiteral = ipaddr.isValid(hostname);

      socket = tlsConnect(
        {
          host: address,
          port: 443,
          ...(isIpLiteral ? {} : { servername: hostname }),
          rejectUnauthorized: true,
          checkServerIdentity: (_tlsHostname, certificate) =>
            verifyHostname(hostname, certificate),
        },
        () => {
          if (!socket) {
            finish({
              status: "unknown",
              diagnosticReason: "tls_socket_missing",
              diagnosticCode: null,
            });
            return;
          }

          if (!socket.authorized) {
            finish(
              isCertificateValidationError(socket.authorizationError)
                ? { status: "certificate_invalid" }
                : {
                  status: "unknown",
                  diagnosticReason: "tls_not_authorized_unknown",
                  diagnosticCode: getSafeSslDiagnosticCode(
                    socket.authorizationError,
                  ),
                },
            );
            return;
          }

          const certificateExpiry = extractCertificateExpiry(socket);

          if ("reason" in certificateExpiry) {
            finish({
              status: "unknown",
              diagnosticReason: certificateExpiry.reason,
              diagnosticCode: "error" in certificateExpiry
                ? getSafeSslDiagnosticCode(certificateExpiry.error)
                : null,
            });
            return;
          }

          finish(
            classifyCertificateExpiry(
              certificateExpiry.expiry,
              now(),
            ),
          );
        },
      );

      socket.once("error", onSocketError);
      socket.setTimeout(timeoutMs, () =>
        finish({
          status: "unknown",
          diagnosticReason: "tls_timeout",
          diagnosticCode: null,
        }));
    } catch (error) {
      finish(
        isCertificateValidationError(error)
          ? { status: "certificate_invalid" }
          : {
            status: "unknown",
            diagnosticReason: "tls_connect_throw",
            diagnosticCode: getSafeSslDiagnosticCode(error),
          },
      );
    }
  });
}

export function resolveFinalSslTarget(
  initialTarget: ResolvedProductionTarget,
  finalUrl: string,
  resolveTarget: (
    rawUrl: string,
  ) => Promise<ResolvedProductionTarget> = validateAndResolveProductionUrl,
): Promise<ResolvedProductionTarget> {
  let parsedFinalUrl: URL;

  try {
    parsedFinalUrl = new URL(finalUrl);
  } catch {
    throw new UnsafeTargetError("Final HTTP URL is invalid");
  }

  const initialHostname = normalizeHostname(initialTarget.url.hostname);
  const finalHostname = normalizeHostname(parsedFinalUrl.hostname);

  if (initialHostname !== finalHostname) {
    return resolveTarget(parsedFinalUrl.toString());
  }

  return Promise.resolve({
    url: parsedFinalUrl,
    addresses: initialTarget.addresses,
  });
}

export async function checkSslTarget(
  target: ResolvedProductionTarget,
  tlsConnect: TlsConnect = defaultTlsConnect,
  now: HealthClock = () => new Date(),
): Promise<SslCheckResult> {
  if (target.url.protocol !== "https:") {
    return criticalResult();
  }

  const hostname = normalizeHostname(target.url.hostname);

  if (!hostname || target.addresses.length === 0) {
    return createUnknownSslResult("no_validated_addresses");
  }

  const deadline = Date.now() + TLS_TIMEOUT_MS;
  let lastUnknown: SslCheckResult | null = null;

  for (const address of target.addresses.slice(0, MAX_TLS_ADDRESSES)) {
    const remainingMs = deadline - Date.now();

    if (remainingMs <= 0) {
      return createUnknownSslResult("tls_deadline_exceeded");
    }

    const result = await probeTlsAddress(
      hostname,
      address,
      Math.min(TLS_TIMEOUT_MS, remainingMs),
      tlsConnect,
      now,
    );

    if ("expiresAt" in result) {
      return result;
    }

    if (result.status === "certificate_invalid") {
      return criticalResult();
    }

    lastUnknown = createUnknownSslResult(
      result.diagnosticReason ?? "tls_socket_error",
      result.diagnosticCode ?? null,
    );
  }

  return lastUnknown ?? createUnknownSslResult("tls_deadline_exceeded");
}
