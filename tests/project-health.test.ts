import { describe, expect, it } from "vitest";

import {
  getHealthCheckErrorMessage,
  isPersistedHealthFailure,
  shouldRefreshHealthSnapshot,
} from "../lib/projects/health-check-action";
import {
  formatHealthTimestamp,
  getHealthAttentionReason,
  getHealthDaysRemaining,
  getHealthStatusPriority,
  getHealthStatusLabel,
  getOperationalHealthStatus,
  getPortfolioStatus,
  getProjectHealth,
  getSslHealthDetails,
  type ProjectHealthSnapshot,
} from "../lib/projects/health";

describe("project health presentation", () => {
  it("maps every canonical status to a human-readable label", () => {
    expect(getHealthStatusLabel("not_configured")).toBe("Not configured");
    expect(getHealthStatusLabel("unknown")).toBe("Unknown");
    expect(getHealthStatusLabel("healthy")).toBe("Healthy");
    expect(getHealthStatusLabel("degraded")).toBe("Degraded");
    expect(getHealthStatusLabel("critical")).toBe("Critical");
  });

  it("does not invent a status label for a missing value", () => {
    expect(getHealthStatusLabel(null)).toBe("Not available");
  });

  it("formats a real health timestamp and leaves null empty", () => {
    expect(formatHealthTimestamp("2026-08-30T10:00:00.000Z")).toContain(
      "2026",
    );
    expect(formatHealthTimestamp(null)).toBeNull();
  });

  it("reads SSL status and expiry from the canonical project_health selection", async () => {
    let selectedColumns = "";
    const supabase = {
      from: () => ({
        select: (columns: string) => {
          selectedColumns = columns;
          return {
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  project_id: "project-1",
                  organization_id: "organization-1",
                  overall_status: "unknown",
                  http_status: "healthy",
                  ssl_status: "degraded",
                  deployment_status: "not_configured",
                  critical_errors_status: "not_configured",
                  integration_freshness_status: "not_configured",
                  http_status_code: 200,
                  http_response_time_ms: 120,
                  ssl_expires_at: "2026-09-18T00:00:00.000Z",
                  critical_error_count: null,
                  last_checked_at: "2026-08-30T00:00:00.000Z",
                  details: {},
                  created_at: "2026-08-30T00:00:00.000Z",
                  updated_at: "2026-08-30T00:00:00.000Z",
                },
                error: null,
              }),
            }),
          };
        },
      }),
    } as never;

    const health = await getProjectHealth(supabase, "project-1");

    expect(selectedColumns).toContain("ssl_status");
    expect(selectedColumns).toContain("ssl_expires_at");
    expect(health?.ssl_status).toBe("degraded");
    expect(health?.ssl_expires_at).toBe("2026-09-18T00:00:00.000Z");
  });

  it.each([
    ["healthy", "2026-11-27T00:00:00.000Z", "Expires in 89 days"],
    ["degraded", "2026-09-17T00:00:00.000Z", "Expires in 18 days"],
    ["critical", "2026-09-03T00:00:00.000Z", "Expires in 4 days"],
  ] as const)("formats %s SSL expiry details", (status, expiresAt, message) => {
    const details = getSslHealthDetails(
      status,
      expiresAt,
      new Date("2026-08-30T00:00:00.000Z"),
    );

    expect(details.message).toBe(message);
    expect(details.expiresLabel).toContain("2026");
  });

  it("shows honest SSL empty states before and when a certificate cannot be determined", () => {
    expect(
      getSslHealthDetails("not_configured", null).message,
    ).toBe("Not checked yet");
    expect(
      getSslHealthDetails("critical", null).message,
    ).toBe("HTTPS is not configured");
    expect(
      getSslHealthDetails("unknown", null).message,
    ).toBe("Certificate expiry could not be determined");
  });

  it("calculates the approximate number of days remaining for the UI", () => {
    expect(
      getHealthDaysRemaining(
        "2026-09-18T00:00:00.000Z",
        new Date("2026-08-30T00:00:00.000Z"),
      ),
    ).toBe(19);
  });

  it("maps missing and canonical overall statuses for the portfolio", () => {
    expect(getOperationalHealthStatus(null)).toBe("unknown");
    expect(getPortfolioStatus(null)).toBe("unknown");
    expect(getPortfolioStatus("not_configured")).toBe("not_configured");
    expect(getPortfolioStatus("unknown")).toBe("unknown");
    expect(getPortfolioStatus("healthy")).toBe("healthy");
    expect(getPortfolioStatus("degraded")).toBe("needs_attention");
    expect(getPortfolioStatus("critical")).toBe("needs_attention");
  });

  it("keeps operational health priority ordered from critical to healthy", () => {
    expect(getHealthStatusPriority("critical")).toBeLessThan(
      getHealthStatusPriority("degraded"),
    );
    expect(getHealthStatusPriority("degraded")).toBeLessThan(
      getHealthStatusPriority("unknown"),
    );
    expect(getHealthStatusPriority("unknown")).toBeLessThan(
      getHealthStatusPriority("not_configured"),
    );
    expect(getHealthStatusPriority("not_configured")).toBeLessThan(
      getHealthStatusPriority("healthy"),
    );
  });

  it("uses only recorded SSL, HTTP, then overall data for attention reasons", () => {
    const baseHealth: ProjectHealthSnapshot = {
      project_id: "project-1",
      organization_id: "organization-1",
      overall_status: "critical",
      http_status: "critical",
      ssl_status: "critical",
      deployment_status: "not_configured",
      critical_errors_status: "not_configured",
      integration_freshness_status: "not_configured",
      http_status_code: 503,
      http_response_time_ms: null,
      ssl_expires_at: null,
      critical_error_count: null,
      last_checked_at: null,
      details: {},
      created_at: "2026-08-30T00:00:00.000Z",
      updated_at: "2026-08-30T00:00:00.000Z",
    };

    expect(getHealthAttentionReason(baseHealth)).toBe("SSL: Critical");
    expect(
      getHealthAttentionReason({
        ...baseHealth,
        overall_status: "degraded",
        ssl_status: "not_configured",
        http_status: "degraded",
      }),
    ).toBe("HTTP: Degraded · 503");
    expect(
      getHealthAttentionReason({
        ...baseHealth,
        http_status: "healthy",
        ssl_status: "not_configured",
      }),
    ).toBe("Overall: Critical");
    expect(getHealthAttentionReason(null)).toBeNull();
  });
});

describe("health check action mapping", () => {
  it.each([
    "network_error",
    "timeout",
    "invalid_redirect",
    "redirect_limit",
  ])("marks %s as a persisted health failure", (code) => {
    expect(isPersistedHealthFailure(code)).toBe(true);
  });

  it.each(["function_unreachable", "check_cooldown", "function_error"])(
    "does not mark %s as a persisted health failure",
    (code) => {
      expect(isPersistedHealthFailure(code)).toBe(false);
    },
  );

  it("keeps function infrastructure errors separate from production URL errors", () => {
    expect(
      getHealthCheckErrorMessage("function_unreachable", 502),
    ).toContain("Health service");
    expect(
      getHealthCheckErrorMessage("function_unreachable", 502),
    ).not.toContain("Production URL");
  });

  it("refreshes the canonical snapshot after a successful SSL response", () => {
    expect(
      shouldRefreshHealthSnapshot({
        ok: true,
        snapshotUpdated: true,
      }),
    ).toBe(true);
  });
});
