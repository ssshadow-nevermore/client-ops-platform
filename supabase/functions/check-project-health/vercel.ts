/// <reference lib="deno.ns" />

import {
  type DeploymentCheckResult,
  type DeploymentFailureReason,
  type SafeDeploymentSnapshot,
} from "./deployment.ts";
import type { HealthStatus } from "./overall.ts";

const VERCEL_DEPLOYMENTS_ENDPOINT = "https://api.vercel.com/v6/deployments";
const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;

export type VercelProjectLink = {
  provider: string;
  external_project_id: string;
};

export type VercelProviderConnection = {
  provider: string;
  external_account_id: string | null;
  credential_ref: string | null;
  status: string;
};

export type VercelFetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type VercelCredentialResolver = (
  credentialRef: string,
) => Promise<string>;

export type VercelProviderOptions = {
  fetchImpl?: VercelFetchLike;
  resolveCredential?: VercelCredentialResolver;
  timeoutMs?: number;
};

export type VercelDeploymentState = SafeDeploymentSnapshot["state"];

export type VercelProviderFailure = Error & {
  code: DeploymentFailureReason;
};

function isVercelProviderFailure(
  error: unknown,
): error is VercelProviderFailure {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }

  return typeof error.code === "string" && [
    "provider_timeout",
    "provider_unreachable",
    "provider_auth_failed",
    "invalid_provider_response",
    "provider_credential_missing",
    "provider_credential_unavailable",
  ].includes(error.code);
}

export function getVercelDeploymentHealthStatus(
  state: unknown,
): HealthStatus {
  if (typeof state !== "string") {
    return "unknown";
  }

  switch (state.toUpperCase()) {
    case "READY":
      return "healthy";
    case "ERROR":
    case "BLOCKED":
    case "CANCELED":
    case "CANCELLED":
      return "degraded";
    case "QUEUED":
    case "INITIALIZING":
    case "BUILDING":
      return "unknown";
    default:
      return "unknown";
  }
}

export function normalizeVercelDeploymentState(
  state: unknown,
): VercelDeploymentState {
  if (typeof state !== "string") {
    return "unknown";
  }

  switch (state.toUpperCase()) {
    case "READY":
      return "ready";
    case "ERROR":
      return "error";
    case "BLOCKED":
      return "blocked";
    case "CANCELED":
    case "CANCELLED":
      return "canceled";
    case "QUEUED":
      return "queued";
    case "INITIALIZING":
      return "initializing";
    case "BUILDING":
      return "building";
    default:
      return "unknown";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  if (
    value.length > 512 ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    return null;
  }

  return value;
}

function getCreatedAt(value: unknown): string | null {
  const date = typeof value === "number"
    ? new Date(value)
    : typeof value === "string"
    ? new Date(value)
    : null;

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function failure(
  failureReason: DeploymentFailureReason,
): DeploymentCheckResult {
  return {
    status: "unknown",
    snapshot: null,
    failureReason,
  };
}

function getProviderError(
  failureReason: DeploymentFailureReason,
): VercelProviderFailure {
  const error = new Error(
    "Vercel deployment check failed",
  ) as VercelProviderFailure;
  error.name = "VercelProviderError";
  error.code = failureReason;
  return error;
}

async function getVercelCredential(
  connection: VercelProviderConnection,
  resolveCredential: VercelCredentialResolver,
): Promise<string> {
  const credentialRef = connection.credential_ref;

  if (!credentialRef) {
    throw getProviderError("provider_credential_missing");
  }

  let token: string;

  try {
    token = await resolveCredential(credentialRef);
  } catch (error) {
    if (isVercelProviderFailure(error)) {
      throw error;
    }

    throw getProviderError("provider_credential_unavailable");
  }

  if (!token || token.trim().length === 0) {
    throw getProviderError("provider_credential_missing");
  }

  return token;
}

function getDeploymentSnapshot(
  value: unknown,
): SafeDeploymentSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const deploymentId = getNonEmptyString(value.uid) ??
    getNonEmptyString(value.id);
  const createdAt = getCreatedAt(value.createdAt);

  if (!deploymentId || !createdAt || typeof value.state !== "string") {
    return null;
  }

  return {
    provider: "vercel",
    deployment_id: deploymentId,
    state: normalizeVercelDeploymentState(value.state),
    created_at: createdAt,
  };
}

async function fetchLatestProductionDeployment(
  projectId: string,
  accountId: string | null,
  token: string,
  options: VercelProviderOptions,
): Promise<unknown> {
  const endpoint = new URL(VERCEL_DEPLOYMENTS_ENDPOINT);
  endpoint.searchParams.set("projectId", projectId);
  endpoint.searchParams.set("target", "production");
  endpoint.searchParams.set("limit", "1");

  if (accountId) {
    endpoint.searchParams.set("teamId", accountId);
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(
    1,
    options.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS,
  );
  const timeoutId = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "ClientOps-HealthCheck/1.0",
      },
    });

    if (response.status === 401 || response.status === 403) {
      throw getProviderError("provider_auth_failed");
    }

    if (!response.ok) {
      throw getProviderError("provider_unreachable");
    }

    try {
      return await response.json();
    } catch {
      throw getProviderError("invalid_provider_response");
    }
  } catch (error) {
    if (isVercelProviderFailure(error)) {
      throw error;
    }

    throw getProviderError(
      controller.signal.aborted ? "provider_timeout" : "provider_unreachable",
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkVercelProductionDeployment(
  link: VercelProjectLink | null,
  connection: VercelProviderConnection | null,
  options: VercelProviderOptions = {},
): Promise<DeploymentCheckResult> {
  if (!link || !connection) {
    return {
      status: "not_configured",
      snapshot: null,
    };
  }

  if (
    link.provider !== "vercel" ||
    connection.provider !== "vercel" ||
    !getNonEmptyString(link.external_project_id)
  ) {
    return failure("invalid_provider_response");
  }

  if (connection.status === "disconnected") {
    return failure("provider_credential_unavailable");
  }

  const resolveCredential = options.resolveCredential ?? (() => {
    throw getProviderError("provider_credential_unavailable");
  });

  let token: string;

  try {
    token = await getVercelCredential(connection, resolveCredential);
  } catch (error) {
    const code = isVercelProviderFailure(error)
      ? error.code as DeploymentFailureReason
      : "provider_auth_failed";

    return failure(code);
  }

  let payload: unknown;

  try {
    payload = await fetchLatestProductionDeployment(
      link.external_project_id,
      connection.external_account_id,
      token,
      options,
    );
  } catch (error) {
    const code = isVercelProviderFailure(error)
      ? error.code as DeploymentFailureReason
      : "provider_unreachable";

    return failure(code);
  }

  if (!isRecord(payload) || !Array.isArray(payload.deployments)) {
    return failure("invalid_provider_response");
  }

  if (payload.deployments.length === 0) {
    return {
      status: "unknown",
      snapshot: null,
    };
  }

  const snapshot = getDeploymentSnapshot(payload.deployments[0]);

  if (!snapshot) {
    return failure("invalid_provider_response");
  }

  return {
    status: getVercelDeploymentHealthStatus(snapshot.state),
    snapshot,
  };
}
