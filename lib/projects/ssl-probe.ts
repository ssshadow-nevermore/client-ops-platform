import { isIP } from "node:net";
import { checkServerIdentity, connect as connectTls } from "node:tls";

import ipaddr from "ipaddr.js";

const TLS_TIMEOUT_MS = 10_000;
const MAX_TLS_ADDRESSES = 3;
const MAX_HOSTNAME_LENGTH = 253;

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

const SAFE_NETWORK_ERROR_CODES = new Set([
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

export type SslProbeInput = {
  hostname: string;
  addresses: string[];
};

export type SslProbeResponse =
  | {
      outcome: "verified";
      expiresAt: string;
    }
  | {
      outcome: "certificate_error";
      code: string | null;
    }
  | {
      outcome: "unknown";
      reason: SslProbeUnknownReason;
      code: string | null;
    };

export type SslProbeUnknownReason =
  | "tls_timeout"
  | "tls_socket_error"
  | "tls_not_authorized_unknown"
  | "tls_socket_missing"
  | "peer_certificate_error"
  | "peer_certificate_missing"
  | "certificate_expiry_missing"
  | "tls_connect_throw"
  | "tls_deadline_exceeded";

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
  once: (event: "error", listener: (error: unknown) => void) => unknown;
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

export type SslProbeDependencies = {
  tlsConnect?: TlsConnect;
  now?: () => Date;
  timeoutMs?: number;
};

type CertificateExpiry = Date | string;

type CertificateExpiryResult =
  | { expiry: CertificateExpiry }
  | { reason: "peer_certificate_error"; error: unknown }
  | { reason: "peer_certificate_missing" }
  | { reason: "certificate_expiry_missing" };

type AddressProbeResult =
  | { outcome: "verified"; expiresAt: string }
  | { outcome: "certificate_error"; code: string | null }
  | {
      outcome: "unknown";
      reason: SslProbeUnknownReason;
      code: string | null;
    };

const defaultTlsConnect: TlsConnect = (options, callback) =>
  connectTls(options, callback);

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

function getSafeNetworkCode(error: unknown): string | null {
  const code = getErrorCode(error)?.toUpperCase();

  return code !== undefined && SAFE_NETWORK_ERROR_CODES.has(code) ? code : null;
}

function getSafeCertificateCode(error: unknown): string | null {
  const code = getErrorCode(error)?.toUpperCase();

  return code !== undefined && CERTIFICATE_ERROR_CODES.has(code) ? code : null;
}

function normalizeHostname(value: string): string | null {
  if (value.length === 0 || value.length > MAX_HOSTNAME_LENGTH) {
    return null;
  }

  if (value !== value.trim() || /[\\/@?#\s]/.test(value)) {
    return null;
  }

  const withoutBrackets =
    value.startsWith("[") || value.endsWith("]")
      ? value.startsWith("[") && value.endsWith("]")
        ? value.slice(1, -1)
        : null
      : value;

  if (!withoutBrackets) {
    return null;
  }

  const hostname = withoutBrackets.toLowerCase().replace(/\.$/, "");

  if (ipaddr.isValid(hostname)) {
    return hostname;
  }

  if (hostname.includes(":")) {
    return null;
  }

  const labels = hostname.split(".");

  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    return null;
  }

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localdomain") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".home.arpa")
  ) {
    return null;
  }

  return hostname;
}

function normalizePublicIp(address: string): string | null {
  // ipaddr.js accepts some ambiguous IPv4 spellings that Node would treat as
  // a hostname. Require Node's literal-IP parser before connecting.
  if (!ipaddr.isValid(address) || isIP(address) === 0) {
    return null;
  }

  let parsed = ipaddr.parse(address);

  if (
    parsed.kind() === "ipv6" &&
    (parsed as ipaddr.IPv6).isIPv4MappedAddress()
  ) {
    parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  }

  return parsed.range() === "unicast" ? parsed.toString() : null;
}

export function validateSslProbeInput(value: unknown): SslProbeInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const body = value as Record<string, unknown>;
  if (typeof body.hostname !== "string" || !Array.isArray(body.addresses)) {
    return null;
  }

  const hostname = normalizeHostname(body.hostname);
  if (!hostname || body.addresses.length < 1 || body.addresses.length > 3) {
    return null;
  }

  const addresses = body.addresses.map((address) =>
    typeof address === "string" ? normalizePublicIp(address) : null,
  );

  if (addresses.some((address) => address === null)) {
    return null;
  }

  return {
    hostname,
    addresses: addresses as string[],
  };
}

function toValidExpiry(value: unknown): CertificateExpiry | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

function extractCertificateExpiry(
  socket: TlsSocketLike,
): CertificateExpiryResult {
  let x509HasMetadata = false;

  if (typeof socket.getPeerX509Certificate === "function") {
    try {
      const x509 = socket.getPeerX509Certificate();

      if (x509 && Object.keys(x509).length > 0) {
        x509HasMetadata = true;
      }

      const validToDate = toValidExpiry(x509?.validToDate);
      if (validToDate !== null) {
        return { expiry: validToDate };
      }

      const validTo = toValidExpiry(x509?.validTo);
      if (validTo !== null) {
        return { expiry: validTo };
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
    const validTo = toValidExpiry(certificate.valid_to);
    if (validTo !== null) {
      return { expiry: validTo };
    }

    return { reason: "certificate_expiry_missing" };
  }

  return {
    reason: x509HasMetadata
      ? "certificate_expiry_missing"
      : "peer_certificate_missing",
  };
}

function probeTlsAddress(
  hostname: string,
  address: string,
  timeoutMs: number,
  tlsConnect: TlsConnect,
): Promise<AddressProbeResult> {
  return new Promise((resolve) => {
    let socket: TlsSocketLike | null = null;
    let settled = false;

    const finish = (result: AddressProbeResult) => {
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
          ? {
              outcome: "certificate_error",
              code: getSafeCertificateCode(error),
            }
          : {
              outcome: "unknown",
              reason: "tls_socket_error",
              code: getSafeNetworkCode(error),
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
            checkServerIdentity(
              hostname,
              certificate as Parameters<typeof checkServerIdentity>[1],
            ) ?? undefined,
        },
        () => {
          if (!socket) {
            finish({
              outcome: "unknown",
              reason: "tls_socket_missing",
              code: null,
            });
            return;
          }

          if (!socket.authorized) {
            finish(
              isCertificateValidationError(socket.authorizationError)
                ? {
                    outcome: "certificate_error",
                    code: getSafeCertificateCode(socket.authorizationError),
                  }
                : {
                    outcome: "unknown",
                    reason: "tls_not_authorized_unknown",
                    code: getSafeNetworkCode(socket.authorizationError),
                  },
            );
            return;
          }

          const certificateExpiry = extractCertificateExpiry(socket);
          if ("reason" in certificateExpiry) {
            finish(
              "error" in certificateExpiry
                ? {
                    outcome: "unknown",
                    reason: certificateExpiry.reason,
                    code: getSafeNetworkCode(certificateExpiry.error),
                  }
                : {
                    outcome: "unknown",
                    reason: certificateExpiry.reason,
                    code: null,
                  },
            );
            return;
          }

          const expiresAt =
            certificateExpiry.expiry instanceof Date
              ? certificateExpiry.expiry
              : new Date(certificateExpiry.expiry);

          if (Number.isNaN(expiresAt.getTime())) {
            finish({
              outcome: "unknown",
              reason: "certificate_expiry_missing",
              code: null,
            });
            return;
          }

          finish({
            outcome: "verified",
            expiresAt: expiresAt.toISOString(),
          });
        },
      );

      socket.once("error", onSocketError);
      socket.setTimeout(timeoutMs, () =>
        finish({
          outcome: "unknown",
          reason: "tls_timeout",
          code: null,
        }),
      );
    } catch (error) {
      finish(
        isCertificateValidationError(error)
          ? {
              outcome: "certificate_error",
              code: getSafeCertificateCode(error),
            }
          : {
              outcome: "unknown",
              reason: "tls_connect_throw",
              code: getSafeNetworkCode(error),
            },
      );
    }
  });
}

export async function probeSslCertificate(
  input: SslProbeInput,
  dependencies: SslProbeDependencies = {},
): Promise<SslProbeResponse> {
  const tlsConnect = dependencies.tlsConnect ?? defaultTlsConnect;
  const timeoutMs = dependencies.timeoutMs ?? TLS_TIMEOUT_MS;
  const deadline = Date.now() + TLS_TIMEOUT_MS;

  let lastUnknown: SslProbeResponse | null = null;

  for (const address of input.addresses.slice(0, MAX_TLS_ADDRESSES)) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return {
        outcome: "unknown",
        reason: "tls_deadline_exceeded",
        code: null,
      };
    }

    const result = await probeTlsAddress(
      input.hostname,
      address,
      Math.min(timeoutMs, remainingMs),
      tlsConnect,
    );

    if (
      result.outcome === "verified" ||
      result.outcome === "certificate_error"
    ) {
      return result;
    }

    lastUnknown = result;
  }

  return (
    lastUnknown ?? {
      outcome: "unknown",
      reason: "tls_deadline_exceeded",
      code: null,
    }
  );
}
