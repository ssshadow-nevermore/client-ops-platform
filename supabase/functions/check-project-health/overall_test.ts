/// <reference lib="deno.ns" />

import {
  calculateOverallStatus,
  type HealthSignalSnapshot,
} from "./overall.ts";

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

function signals(
  overrides: Partial<HealthSignalSnapshot> = {},
): HealthSignalSnapshot {
  return {
    http_status: "not_configured",
    ssl_status: "not_configured",
    deployment_status: "not_configured",
    critical_errors_status: "not_configured",
    integration_freshness_status: "not_configured",
    ...overrides,
  };
}

Deno.test("all not-configured signals produce not_configured overall", () => {
  assertEquals(
    calculateOverallStatus(signals()),
    "not_configured",
  );
});

Deno.test("healthy HTTP and SSL with remaining signals not configured produce unknown", () => {
  assertEquals(
    calculateOverallStatus(
      signals({
        http_status: "healthy",
        ssl_status: "healthy",
      }),
    ),
    "unknown",
  );
});

Deno.test("degraded SSL produces degraded overall", () => {
  assertEquals(
    calculateOverallStatus(signals({ ssl_status: "degraded" })),
    "degraded",
  );
});

Deno.test("critical SSL produces critical overall", () => {
  assertEquals(
    calculateOverallStatus(signals({ ssl_status: "critical" })),
    "critical",
  );
});

Deno.test("critical HTTP produces critical overall even with healthy SSL", () => {
  assertEquals(
    calculateOverallStatus(
      signals({
        http_status: "critical",
        ssl_status: "healthy",
      }),
    ),
    "critical",
  );
});

Deno.test("all five healthy signals produce healthy overall", () => {
  assertEquals(
    calculateOverallStatus({
      http_status: "healthy",
      ssl_status: "healthy",
      deployment_status: "healthy",
      critical_errors_status: "healthy",
      integration_freshness_status: "healthy",
    }),
    "healthy",
  );
});

Deno.test("unknown without degraded or critical remains unknown", () => {
  assertEquals(
    calculateOverallStatus(
      signals({
        http_status: "healthy",
        ssl_status: "unknown",
      }),
    ),
    "unknown",
  );
});
