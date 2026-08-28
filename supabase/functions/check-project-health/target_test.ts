/// <reference lib="deno.ns" />

import {
  type DnsResolver,
  UnsafeTargetError,
  validateAndResolveProductionUrl,
} from "./target.ts";

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

async function assertUnsafe(
  url: string,
  resolver?: DnsResolver,
): Promise<void> {
  try {
    await validateAndResolveProductionUrl(url, resolver);
  } catch (error) {
    assert(
      error instanceof UnsafeTargetError,
      `Expected UnsafeTargetError, received ${String(error)}`,
    );

    return;
  }

  throw new Error(`Expected "${url}" to be rejected`);
}

const publicResolver: DnsResolver = (_hostname, recordType) => {
  if (recordType === "A") {
    return Promise.resolve(["93.184.216.34"]);
  }

  return Promise.resolve([]);
};

Deno.test("allows public HTTPS hostname", async () => {
  const target = await validateAndResolveProductionUrl(
    "https://example.com",
    publicResolver,
  );

  assertEquals(target.url.toString(), "https://example.com/");
  assertEquals(target.addresses.length, 1);
  assertEquals(target.addresses[0], "93.184.216.34");
});

Deno.test("allows public literal IPv4 address", async () => {
  const target = await validateAndResolveProductionUrl(
    "https://93.184.216.34",
  );

  assertEquals(target.addresses[0], "93.184.216.34");
});

Deno.test("rejects localhost", async () => {
  await assertUnsafe("http://localhost");
});

Deno.test("rejects IPv4 loopback", async () => {
  await assertUnsafe("http://127.0.0.1");
});

Deno.test("rejects private 10/8 address", async () => {
  await assertUnsafe("http://10.0.0.1");
});

Deno.test("rejects private 192.168/16 address", async () => {
  await assertUnsafe("http://192.168.1.1");
});

Deno.test("rejects IPv6 loopback", async () => {
  await assertUnsafe("http://[::1]");
});

Deno.test("rejects internal hostname suffix", async () => {
  await assertUnsafe(
    "https://service.internal",
    publicResolver,
  );
});

Deno.test("rejects unsupported protocol", async () => {
  await assertUnsafe(
    "ftp://example.com",
    publicResolver,
  );
});

Deno.test("rejects URL credentials", async () => {
  await assertUnsafe(
    "https://user:password@example.com",
    publicResolver,
  );
});

Deno.test("rejects non-standard HTTPS port", async () => {
  await assertUnsafe(
    "https://example.com:8443",
    publicResolver,
  );
});

Deno.test("rejects hostname resolving to private address", async () => {
  const privateResolver: DnsResolver = (_hostname, recordType) => {
    if (recordType === "A") {
      return Promise.resolve(["192.168.1.20"]);
    }

    return Promise.resolve([]);
  };

  await assertUnsafe(
    "https://example.com",
    privateResolver,
  );
});

Deno.test("rejects mixed public and private DNS answers", async () => {
  const mixedResolver: DnsResolver = (_hostname, recordType) => {
    if (recordType === "A") {
      return Promise.resolve([
        "93.184.216.34",
        "127.0.0.1",
      ]);
    }

    return Promise.resolve([]);
  };

  await assertUnsafe(
    "https://example.com",
    mixedResolver,
  );
});

Deno.test("rejects hostname with no DNS addresses", async () => {
  const emptyResolver: DnsResolver = () => Promise.resolve([]);

  await assertUnsafe(
    "https://example.com",
    emptyResolver,
  );
});
