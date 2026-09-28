/// <reference lib="deno.ns" />

import {
  getCriticalErrorsHealthStatus,
  mergeCriticalErrorsDetails,
  type SafeCriticalErrorsSnapshot,
} from "./critical-errors.ts";

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

const snapshot: SafeCriticalErrorsSnapshot = {
  provider: "sentry",
  window: "24h",
  issue_count: 2,
  error_count: 1,
  fatal_count: 1,
  truncated: false,
  latest_seen_at: "2026-09-01T11:00:00.000Z",
};

Deno.test("maps critical error counts to canonical health statuses", () => {
  assertEquals(getCriticalErrorsHealthStatus(0, 0), "healthy");
  assertEquals(getCriticalErrorsHealthStatus(1, 0), "degraded");
  assertEquals(getCriticalErrorsHealthStatus(0, 1), "critical");
  assertEquals(getCriticalErrorsHealthStatus(1, 1), "critical");
});

Deno.test("merges critical errors snapshot without removing other signal details", () => {
  const merged = mergeCriticalErrorsDetails(
    {
      deployment: { provider: "vercel" },
      ssl: { expires_at: "2026-09-20T00:00:00.000Z" },
      critical_errors: { stale: true },
    },
    snapshot,
  );

  assertEquals(
    (merged.deployment as Record<string, unknown>).provider,
    "vercel",
  );
  assertEquals(
    (merged.ssl as Record<string, unknown>).expires_at,
    "2026-09-20T00:00:00.000Z",
  );
  assertEquals(merged.critical_errors, snapshot);
});

Deno.test("removes stale critical errors details after a failed provider check", () => {
  const merged = mergeCriticalErrorsDetails(
    {
      deployment: { provider: "vercel" },
      critical_errors: { ...snapshot },
    },
    null,
  );

  assert("deployment" in merged, "deployment details must remain");
  assert(
    !("critical_errors" in merged),
    "stale critical details must be removed",
  );
});
