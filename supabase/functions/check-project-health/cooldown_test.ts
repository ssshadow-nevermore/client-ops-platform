/// <reference lib="deno.ns" />

import {
  getHealthCheckCooldownRetryAfterSeconds,
  HEALTH_CHECK_COOLDOWN_SECONDS,
} from "./cooldown.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

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

const now = new Date("2026-08-30T10:00:00.000Z");

Deno.test("does not apply cooldown without a previous check", () => {
  assertEquals(
    getHealthCheckCooldownRetryAfterSeconds(null, now),
    null,
  );
});

Deno.test("allows a check at the cooldown boundary", () => {
  const lastCheckedAt = new Date(
    now.getTime() - HEALTH_CHECK_COOLDOWN_SECONDS * 1000,
  ).toISOString();

  assertEquals(
    getHealthCheckCooldownRetryAfterSeconds(lastCheckedAt, now),
    null,
  );
});

Deno.test("returns remaining seconds while cooldown is active", () => {
  const lastCheckedAt = new Date(
    now.getTime() - 10_000,
  ).toISOString();

  assertEquals(
    getHealthCheckCooldownRetryAfterSeconds(lastCheckedAt, now),
    20,
  );
});

Deno.test("rounds a partial second up to a retry-safe value", () => {
  const lastCheckedAt = new Date(
    now.getTime() - 29_100,
  ).toISOString();

  assertEquals(
    getHealthCheckCooldownRetryAfterSeconds(lastCheckedAt, now),
    1,
  );
});

Deno.test("ignores an invalid previous timestamp", () => {
  assert(
    getHealthCheckCooldownRetryAfterSeconds("not-a-timestamp", now) === null,
    "invalid timestamps must not activate cooldown",
  );
});
