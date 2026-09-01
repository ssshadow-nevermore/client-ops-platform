/// <reference lib="deno.ns" />

import {
  mergeDeploymentDetails,
  withoutDeploymentDetails,
} from "./deployment.ts";

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

const snapshot = {
  provider: "vercel" as const,
  deployment_id: "dpl_123",
  state: "ready" as const,
  created_at: "2026-09-01T00:00:00.000Z",
};

Deno.test("deployment details merge preserves HTTP and SSL details", () => {
  const merged = mergeDeploymentDetails(
    {
      http: { statusCode: 206 },
      ssl: { expiresAt: "2026-10-01T00:00:00.000Z" },
      deployment: { provider: "vercel", state: "error" },
    },
    snapshot,
  );

  assertEquals((merged.http as { statusCode: number }).statusCode, 206);
  assertEquals(
    (merged.ssl as { expiresAt: string }).expiresAt,
    "2026-10-01T00:00:00.000Z",
  );
  assertEquals((merged.deployment as typeof snapshot).deployment_id, "dpl_123");
});

Deno.test("failed deployment check removes stale deployment detail but preserves other details", () => {
  const merged = mergeDeploymentDetails(
    {
      http: { statusCode: 206 },
      ssl: { expiresAt: "2026-10-01T00:00:00.000Z" },
      deployment: { provider: "vercel", state: "ready" },
    },
    null,
  );

  assert(!("deployment" in merged), "stale deployment detail must be removed");
  assert("http" in merged, "HTTP details must remain");
  assert("ssl" in merged, "SSL details must remain");
});

Deno.test("withoutDeploymentDetails does not expose old provider snapshot", () => {
  const result = withoutDeploymentDetails({
    deployment: {
      provider: "vercel",
      token: "must not remain",
    },
    http: { statusCode: 200 },
  });

  assertEquals("deployment" in result, false);
  assertEquals(JSON.stringify(result).includes("must not remain"), false);
  assertEquals((result.http as { statusCode: number }).statusCode, 200);
});
