/// <reference lib="deno.ns" />

import type { HealthStatus } from "./overall.ts";

export type SafeDeploymentSnapshot = {
  provider: "vercel";
  deployment_id: string;
  state:
    | "ready"
    | "error"
    | "blocked"
    | "canceled"
    | "queued"
    | "initializing"
    | "building"
    | "unknown";
  created_at: string;
};

export type DeploymentFailureReason =
  | "provider_timeout"
  | "provider_unreachable"
  | "provider_auth_failed"
  | "invalid_provider_response"
  | "provider_credential_missing"
  | "provider_credential_unavailable";

export type DeploymentCheckResult = {
  status: HealthStatus;
  snapshot: SafeDeploymentSnapshot | null;
  failureReason?: DeploymentFailureReason;
};

export function withoutDeploymentDetails(
  details: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(details).filter(([key]) => key !== "deployment"),
  );
}

export function mergeDeploymentDetails(
  details: Record<string, unknown>,
  snapshot: SafeDeploymentSnapshot | null,
): Record<string, unknown> {
  const preservedDetails = withoutDeploymentDetails(details);

  return snapshot
    ? {
      ...preservedDetails,
      deployment: snapshot,
    }
    : preservedDetails;
}
