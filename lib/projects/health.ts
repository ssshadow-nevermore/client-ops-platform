import type { SupabaseClient } from "@supabase/supabase-js";

export type HealthStatus =
  | "not_configured"
  | "unknown"
  | "healthy"
  | "degraded"
  | "critical";

export type ProjectHealthSnapshot = {
  project_id: string;
  organization_id: string;
  overall_status: HealthStatus;
  http_status: HealthStatus;
  ssl_status: HealthStatus;
  deployment_status: HealthStatus;
  critical_errors_status: HealthStatus;
  integration_freshness_status: HealthStatus;
  http_status_code: number | null;
  http_response_time_ms: number | null;
  ssl_expires_at: string | null;
  critical_error_count: number | null;
  last_checked_at: string | null;
  details: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export const HEALTH_STATUS_LABELS: Record<HealthStatus, string> = {
  not_configured: "Not configured",
  unknown: "Unknown",
  healthy: "Healthy",
  degraded: "Degraded",
  critical: "Critical",
};

const projectHealthSelect = `
  project_id,
  organization_id,
  overall_status,
  http_status,
  ssl_status,
  deployment_status,
  critical_errors_status,
  integration_freshness_status,
  http_status_code,
  http_response_time_ms,
  ssl_expires_at,
  critical_error_count,
  last_checked_at,
  details,
  created_at,
  updated_at
`;

export async function getProjectHealth(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectHealthSnapshot | null> {
  const { data, error } = await supabase
    .from("project_health")
    .select(projectHealthSelect)
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ProjectHealthSnapshot | null) ?? null;
}

export async function getProjectHealthByProjectIds(
  supabase: SupabaseClient,
  projectIds: string[],
): Promise<Map<string, ProjectHealthSnapshot>> {
  if (projectIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("project_health")
    .select(projectHealthSelect)
    .in("project_id", projectIds);

  if (error) {
    throw error;
  }

  return new Map(
    ((data as ProjectHealthSnapshot[] | null) ?? []).map((health) => [
      health.project_id,
      health,
    ]),
  );
}

export function getHealthStatusLabel(
  status: HealthStatus | null | undefined,
): string {
  return status ? HEALTH_STATUS_LABELS[status] ?? "Not available" : "Not available";
}

export function formatHealthTimestamp(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function getHealthDaysRemaining(
  value: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!value) {
    return null;
  }

  const expiresAt = new Date(value);

  if (
    Number.isNaN(expiresAt.getTime()) ||
    Number.isNaN(now.getTime())
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
  );
}

export type SslHealthDetails = {
  expiresLabel: string | null;
  daysRemaining: number | null;
  message: string;
};

export function getSslHealthDetails(
  status: HealthStatus,
  expiresAt: string | null | undefined,
  now: Date = new Date(),
): SslHealthDetails {
  const expiresLabel = formatHealthTimestamp(expiresAt);
  const daysRemaining = getHealthDaysRemaining(expiresAt, now);

  if (status === "not_configured") {
    return {
      expiresLabel: null,
      daysRemaining: null,
      message: "Not checked yet",
    };
  }

  if (status === "unknown") {
    return {
      expiresLabel,
      daysRemaining,
      message: "Certificate expiry could not be determined",
    };
  }

  if (expiresLabel && daysRemaining !== null) {
    return {
      expiresLabel,
      daysRemaining,
      message: daysRemaining === 0
        ? "Certificate expired"
        : `Expires in ${daysRemaining} days`,
    };
  }

  return {
    expiresLabel,
    daysRemaining,
    message: status === "critical"
      ? "HTTPS is not configured"
      : "Certificate expiry not available",
  };
}
