/// <reference lib="deno.ns" />

import {
  addVaultStatementTimeout,
  createProviderCredentialResolver,
  createVaultSecretReader,
  ProviderCredentialError,
} from "./vault.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${expected}, got ${actual}`);
  }
}

const validRef = "550e8400-e29b-41d4-a716-446655440000";

Deno.test("Vault connection URL applies a bounded statement timeout", () => {
  const url = new URL(
    addVaultStatementTimeout(
      "postgresql://vault-reader@localhost:54322/postgres?sslmode=require",
    ),
  );

  assertEquals(url.searchParams.get("sslmode"), "require");
  assert(
    url.searchParams.get("options")?.includes("-c statement_timeout=5000"),
    "Vault queries must have a bounded PostgreSQL statement timeout",
  );
});

Deno.test("server-side Vault reader uses a parameterized single-row query", async () => {
  let queryParts: string[] = [];
  let queryValues: unknown[] = [];
  let releaseCount = 0;

  const reader = createVaultSecretReader({
    connect: () =>
      Promise.resolve({
        queryObject<T extends Record<string, unknown>>(
          query: TemplateStringsArray,
          ...values: unknown[]
        ): Promise<{ rows: T[] }> {
          queryParts = [...query];
          queryValues = values;

          return Promise.resolve({
            rows: [{ decrypted_secret: "fake-vault-secret" } as unknown as T],
          });
        },
        release: () => {
          releaseCount += 1;
        },
      }),
  });
  const resolveProviderCredential = createProviderCredentialResolver(reader);

  const credential = await resolveProviderCredential(validRef);

  assertEquals(credential, "fake-vault-secret");
  assert(
    queryParts.join(" ").includes("vault.decrypted_secrets"),
    "Vault reader must query decrypted secrets",
  );
  assert(
    queryParts.join(" ").includes("LIMIT 1"),
    "Vault reader must limit the query to one row",
  );
  assertEquals(queryValues[0], validRef);
  assertEquals(releaseCount, 1);
});

Deno.test("valid Vault ref resolves a credential through the server-side reader", async () => {
  let receivedRef: string | null = null;
  const resolveProviderCredential = createProviderCredentialResolver(
    (credentialRef) => {
      receivedRef = credentialRef;
      return Promise.resolve("fake-vault-secret");
    },
  );

  const credential = await resolveProviderCredential(validRef);

  assertEquals(credential, "fake-vault-secret");
  assertEquals(receivedRef, validRef);
});

Deno.test("invalid Vault ref fails closed before reading", async () => {
  let readerCalled = false;
  const resolveProviderCredential = createProviderCredentialResolver(
    () => {
      readerCalled = true;
      return Promise.resolve("fake-vault-secret");
    },
  );

  try {
    await resolveProviderCredential("vault://not-a-uuid");
    throw new Error("invalid ref should fail");
  } catch (error) {
    assert(error instanceof ProviderCredentialError, "typed failure expected");
    assertEquals(error.code, "provider_credential_missing");
  }

  assertEquals(readerCalled, false);
});

Deno.test("missing Vault secret fails closed", async () => {
  const resolveProviderCredential = createProviderCredentialResolver(
    () => Promise.resolve(null),
  );

  try {
    await resolveProviderCredential(validRef);
    throw new Error("missing secret should fail");
  } catch (error) {
    assert(error instanceof ProviderCredentialError, "typed failure expected");
    assertEquals(error.code, "provider_credential_missing");
  }
});

Deno.test("Vault database failure becomes a controlled unavailable error", async () => {
  const resolveProviderCredential = createProviderCredentialResolver(
    () => Promise.reject(new Error("database details must not escape")),
  );

  try {
    await resolveProviderCredential(validRef);
    throw new Error("database failure should fail");
  } catch (error) {
    assert(error instanceof ProviderCredentialError, "typed failure expected");
    assertEquals(error.code, "provider_credential_unavailable");
    assertEquals(error.message, "Provider credential is unavailable");
    assert(
      !JSON.stringify(error).includes("database details"),
      "database details must not escape",
    );
  }
});
