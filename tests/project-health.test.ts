import { describe, expect, it } from "vitest";

import {
  getHealthCheckErrorMessage,
  isPersistedHealthFailure,
} from "../lib/projects/health-check-action";
import {
  formatHealthTimestamp,
  getHealthStatusLabel,
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
});
