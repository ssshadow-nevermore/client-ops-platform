/// <reference lib="deno.ns" />

import type { HealthStatus } from "./overall.ts";

export type SafeCriticalErrorsSnapshot = {
  provider: "sentry";
  window: "24h";
  issue_count: number;
  error_count: number;
  fatal_count: number;
  truncated: boolean;
  latest_seen_at: string | null;
};

export type CriticalErrorsFailureReason =
  | "provider_timeout"
  | "provider_unreachable"
  | "provider_auth_failed"
  | "invalid_provider_response"
  | "provider_credential_missing"
  | "provider_credential_unavailable";

export type CriticalErrorsCheckResult = {
  status: HealthStatus;
  snapshot: SafeCriticalErrorsSnapshot | null;
  failureReason?: CriticalErrorsFailureReason;
};

export function getCriticalErrorsHealthStatus(
  errorCount: number,
  fatalCount: number,
): HealthStatus {
  if (fatalCount > 0) {
    return "critical";
  }

  if (errorCount > 0) {
    return "degraded";
  }

  return "healthy";
}

export function withoutCriticalErrorsDetails(
  details: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(details).filter(([key]) => key !== "critical_errors"),
  );
}

export function mergeCriticalErrorsDetails(
  details: Record<string, unknown>,
  snapshot: SafeCriticalErrorsSnapshot | null,
): Record<string, unknown> {
  const preservedDetails = withoutCriticalErrorsDetails(details);

  return snapshot
    ? {
      ...preservedDetails,
      critical_errors: snapshot,
    }
    : preservedDetails;
}
