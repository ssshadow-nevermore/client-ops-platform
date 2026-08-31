/// <reference lib="deno.ns" />

export type HealthStatus =
  | "not_configured"
  | "unknown"
  | "healthy"
  | "degraded"
  | "critical";

export type HealthSignalSnapshot = {
  http_status: HealthStatus;
  ssl_status: HealthStatus;
  deployment_status: HealthStatus;
  critical_errors_status: HealthStatus;
  integration_freshness_status: HealthStatus;
};

export function calculateOverallStatus(
  signals: HealthSignalSnapshot,
): HealthStatus {
  const statuses = Object.values(signals);

  if (statuses.some((status) => status === "critical")) {
    return "critical";
  }

  if (statuses.some((status) => status === "degraded")) {
    return "degraded";
  }

  if (statuses.every((status) => status === "healthy")) {
    return "healthy";
  }

  if (statuses.every((status) => status === "not_configured")) {
    return "not_configured";
  }

  return "unknown";
}
