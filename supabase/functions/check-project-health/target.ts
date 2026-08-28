/// <reference lib="deno.ns" />

import ipaddr from "ipaddr.js";

export class UnsafeTargetError extends Error {}

export type ResolvedProductionTarget = {
  url: URL;
  addresses: string[];
};

export type DnsResolver = (
  hostname: string,
  recordType: "A" | "AAAA",
) => Promise<string[]>;

const defaultDnsResolver: DnsResolver = (hostname, recordType) =>
  Deno.resolveDns(hostname, recordType);

function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

function isPublicIp(address: string): boolean {
  if (!ipaddr.isValid(address)) {
    return false;
  }

  let parsed = ipaddr.parse(address);

  if (
    parsed.kind() === "ipv6" &&
    (parsed as ipaddr.IPv6).isIPv4MappedAddress()
  ) {
    parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  }

  return parsed.range() === "unicast";
}

export async function validateAndResolveProductionUrl(
  rawUrl: string,
  resolveDns: DnsResolver = defaultDnsResolver,
): Promise<ResolvedProductionTarget> {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeTargetError("Production URL is invalid");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeTargetError(
      "Only HTTP and HTTPS URLs are allowed",
    );
  }

  if (url.username || url.password) {
    throw new UnsafeTargetError(
      "URLs containing credentials are not allowed",
    );
  }

  if (
    url.port &&
    !(
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    )
  ) {
    throw new UnsafeTargetError(
      "Only standard HTTP and HTTPS ports are allowed",
    );
  }

  const hostname = normalizeHostname(url.hostname);

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localdomain") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".home.arpa")
  ) {
    throw new UnsafeTargetError(
      "Local and internal hostnames are not allowed",
    );
  }

  /*
   * Literal IP address.
   */
  if (ipaddr.isValid(hostname)) {
    if (!isPublicIp(hostname)) {
      throw new UnsafeTargetError(
        "Private or reserved IP addresses are not allowed",
      );
    }

    return {
      url,
      addresses: [hostname],
    };
  }

  /*
   * Reject single-label names such as:
   *
   * database
   * router
   * redis
   */
  if (!hostname.includes(".")) {
    throw new UnsafeTargetError(
      "Production URL must use a public hostname",
    );
  }

  const [ipv4Result, ipv6Result] = await Promise.allSettled([
    resolveDns(hostname, "A"),
    resolveDns(hostname, "AAAA"),
  ]);

  const addresses: string[] = [];

  if (ipv4Result.status === "fulfilled") {
    addresses.push(...ipv4Result.value);
  }

  if (ipv6Result.status === "fulfilled") {
    addresses.push(...ipv6Result.value);
  }

  if (addresses.length === 0) {
    throw new UnsafeTargetError(
      "Production hostname could not be resolved",
    );
  }

  /*
   * Reject the whole hostname if ANY resolved address is
   * non-public.
   *
   * A hostname resolving to both:
   *
   * 93.184.216.34
   * 127.0.0.1
   *
   * is therefore rejected.
   */
  if (addresses.some((address) => !isPublicIp(address))) {
    throw new UnsafeTargetError(
      "Production hostname resolves to a private or reserved address",
    );
  }

  return {
    url,
    addresses: [...new Set(addresses)],
  };
}
