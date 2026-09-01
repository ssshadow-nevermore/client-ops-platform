/// <reference lib="deno.ns" />

import { Pool } from "@db/postgres";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const VAULT_QUERY_TIMEOUT_MS = 5_000;

export type ProviderCredentialFailureReason =
  | "provider_credential_missing"
  | "provider_credential_unavailable";

export type VaultSecretReader = (
  credentialRef: string,
) => Promise<string | null>;

export type VaultConnection = {
  queryObject<T extends Record<string, unknown>>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<{ rows: T[] }>;
  release(): void;
};

export type VaultPool = {
  connect(): Promise<VaultConnection>;
};

export class ProviderCredentialError extends Error {
  readonly code: ProviderCredentialFailureReason;

  constructor(code: ProviderCredentialFailureReason) {
    super(
      code === "provider_credential_missing"
        ? "Provider credential is missing"
        : "Provider credential is unavailable",
    );
    this.name = "ProviderCredentialError";
    this.code = code;
  }
}

let vaultPool: Pool | null = null;

export function addVaultStatementTimeout(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const existingOptions = url.searchParams.get("options")?.trim();
  const timeoutOption = `-c statement_timeout=${VAULT_QUERY_TIMEOUT_MS}`;

  url.searchParams.set(
    "options",
    existingOptions ? `${existingOptions} ${timeoutOption}` : timeoutOption,
  );

  return url.toString();
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function getVaultPool(): Pool {
  if (vaultPool) {
    return vaultPool;
  }

  const databaseUrl = Deno.env.get("SUPABASE_DB_URL");

  if (!databaseUrl) {
    throw new ProviderCredentialError(
      "provider_credential_unavailable",
    );
  }

  // @db/postgres does not expose a cancellable query API. Set a PostgreSQL
  // session statement timeout so a Vault query cannot wait indefinitely once
  // the connection is established. The pool is invalidated on any connection
  // or query failure so the next request can recover with a fresh connection.
  vaultPool = new Pool(addVaultStatementTimeout(databaseUrl), 1, true);
  return vaultPool;
}

function invalidateVaultPool(pool: Pool): void {
  if (vaultPool !== pool) {
    return;
  }

  vaultPool = null;
  void pool.end().catch(() => undefined);
}

async function readVaultSecretFromPool(
  pool: VaultPool,
  credentialRef: string,
): Promise<string | null> {
  let connection: VaultConnection | null = null;
  let shouldInvalidatePool = false;

  try {
    connection = await pool.connect();
    const result = await connection.queryObject<{
      decrypted_secret: string | null;
    }>`
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE id = ${credentialRef}::uuid
      LIMIT 1
    `;

    const secret = result.rows[0]?.decrypted_secret;

    return typeof secret === "string" && secret.trim().length > 0
      ? secret
      : null;
  } catch (error) {
    shouldInvalidatePool = true;
    throw error;
  } finally {
    connection?.release();

    if (shouldInvalidatePool && pool === vaultPool) {
      invalidateVaultPool(pool as Pool);
    }
  }
}

export function createVaultSecretReader(pool: VaultPool): VaultSecretReader {
  return (credentialRef) => readVaultSecretFromPool(pool, credentialRef);
}

function readVaultSecret(credentialRef: string): Promise<string | null> {
  return readVaultSecretFromPool(
    getVaultPool() as unknown as VaultPool,
    credentialRef,
  );
}

export function createProviderCredentialResolver(
  readSecret: VaultSecretReader = readVaultSecret,
): (credentialRef: string) => Promise<string> {
  return async function resolveProviderCredential(
    credentialRef: string,
  ): Promise<string> {
    if (!isUuid(credentialRef)) {
      throw new ProviderCredentialError("provider_credential_missing");
    }

    let secret: string | null;

    try {
      secret = await readSecret(credentialRef);
    } catch (error) {
      if (error instanceof ProviderCredentialError) {
        throw error;
      }

      throw new ProviderCredentialError(
        "provider_credential_unavailable",
      );
    }

    if (!secret || secret.trim().length === 0) {
      throw new ProviderCredentialError("provider_credential_missing");
    }

    return secret;
  };
}

export const resolveProviderCredential = createProviderCredentialResolver();
