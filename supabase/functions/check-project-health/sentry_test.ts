/// <reference lib="deno.ns" />

import { checkSentryCriticalErrors, type SentryFetchLike } from "./sentry.ts";

function assert(
  condition: unknown,
  message = "Expected condition to be true",
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${expected}, got ${actual}`);
  }
}

const linkedProject = {
  provider: "sentry",
  external_project_id: "project-slug",
};

const linkedConnection = {
  provider: "sentry",
  external_account_id: "organization-slug",
  credential_ref: "550e8400-e29b-41d4-a716-446655440000",
  status: "connected",
};

function jsonFetch(
  payload: unknown,
  status = 200,
  headers: HeadersInit = { "Content-Type": "application/json" },
): SentryFetchLike {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(payload), { status, headers }),
    );
}

Deno.test("missing Sentry link or connection is not configured without provider calls", async () => {
  let resolverCalled = false;
  let fetchCalled = false;

  for (
    const [link, connection] of [
      [null, null],
      [linkedProject, null],
      [null, linkedConnection],
    ] as const
  ) {
    const result = await checkSentryCriticalErrors(link, connection, {
      resolveCredential: () => {
        resolverCalled = true;
        return Promise.resolve("fake-sentry-token");
      },
      fetchImpl: () => {
        fetchCalled = true;
        return Promise.resolve(new Response("unexpected"));
      },
    });

    assertEquals(result.status, "not_configured");
    assertEquals(result.snapshot, null);
  }

  assertEquals(resolverCalled, false);
  assertEquals(fetchCalled, false);
});

Deno.test("zero unresolved error and fatal issues is healthy", async () => {
  const result = await checkSentryCriticalErrors(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("fake-sentry-token"),
      fetchImpl: jsonFetch([]),
    },
  );

  assertEquals(result.status, "healthy");
  assert(result.snapshot, "snapshot is required");
  assertEquals(result.snapshot.issue_count, 0);
  assertEquals(result.snapshot.error_count, 0);
  assertEquals(result.snapshot.fatal_count, 0);
  assertEquals(result.snapshot.latest_seen_at, null);
  assertEquals(result.snapshot.truncated, false);
});

Deno.test("error and fatal issues map to degraded and critical", async () => {
  const issues = [
    { level: "error", lastSeen: "2026-09-01T10:00:00.000Z" },
    { level: "fatal", lastSeen: "2026-09-01T11:00:00.000Z" },
    { level: "warning", lastSeen: "2026-09-01T12:00:00.000Z" },
  ];

  const mixedResult = await checkSentryCriticalErrors(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("fake-sentry-token"),
      fetchImpl: jsonFetch(issues),
    },
  );

  assertEquals(mixedResult.status, "critical");
  assert(mixedResult.snapshot, "snapshot is required");
  assertEquals(mixedResult.snapshot.issue_count, 2);
  assertEquals(mixedResult.snapshot.error_count, 1);
  assertEquals(mixedResult.snapshot.fatal_count, 1);
  assertEquals(mixedResult.snapshot.latest_seen_at, "2026-09-01T11:00:00.000Z");

  const degradedResult = await checkSentryCriticalErrors(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("fake-sentry-token"),
      fetchImpl: jsonFetch([
        { level: "ERROR", lastSeen: "2026-09-01T10:00:00.000Z" },
      ]),
    },
  );

  assertEquals(degradedResult.status, "degraded");
  assertEquals(degradedResult.snapshot?.error_count, 1);
  assertEquals(degradedResult.snapshot?.fatal_count, 0);
});

Deno.test("unknown issue levels are ignored without becoming critical", async () => {
  const result = await checkSentryCriticalErrors(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("fake-sentry-token"),
      fetchImpl: jsonFetch([
        { level: "warning", lastSeen: "2026-09-01T10:00:00.000Z" },
      ]),
    },
  );

  assertEquals(result.status, "healthy");
  assertEquals(result.snapshot?.issue_count, 0);
});

Deno.test("malformed provider response fails closed", async () => {
  const malformedResponses: unknown[] = [
    { issues: [] },
    [{ level: "error" }],
  ];

  for (const payload of malformedResponses) {
    const result = await checkSentryCriticalErrors(
      linkedProject,
      linkedConnection,
      {
        resolveCredential: () => Promise.resolve("fake-sentry-token"),
        fetchImpl: jsonFetch(payload),
      },
    );

    assertEquals(result.status, "unknown");
    assertEquals(result.failureReason, "invalid_provider_response");
    assertEquals(result.snapshot, null);
  }
});

Deno.test("ignores malformed lastSeen while retaining valid issue classification", async () => {
  const result = await checkSentryCriticalErrors(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("fake-sentry-token"),
      fetchImpl: jsonFetch([
        { level: "error", lastSeen: "not-a-date" },
        { level: "fatal", lastSeen: "2026-09-01T11:00:00.000Z" },
      ]),
    },
  );

  assertEquals(result.status, "critical");
  assertEquals(result.snapshot?.issue_count, 2);
  assertEquals(result.snapshot?.error_count, 1);
  assertEquals(result.snapshot?.fatal_count, 1);
  assertEquals(result.snapshot?.latest_seen_at, "2026-09-01T11:00:00.000Z");
});

Deno.test("provider failures become unknown with safe reasons", async () => {
  const cases = [
    [401, "provider_auth_failed"],
    [403, "provider_auth_failed"],
    [500, "provider_unreachable"],
  ] as const;

  for (const [status, reason] of cases) {
    const result = await checkSentryCriticalErrors(
      linkedProject,
      linkedConnection,
      {
        resolveCredential: () => Promise.resolve("fake-sentry-token"),
        fetchImpl: jsonFetch({ secret: "provider response details" }, status),
      },
    );

    assertEquals(result.status, "unknown");
    assertEquals(result.failureReason, reason);
    assert(
      !JSON.stringify(result).includes("provider response details"),
      "provider response details must not escape",
    );
  }
});

Deno.test("network failure and timeout are normalized without raw errors", async () => {
  const networkResult = await checkSentryCriticalErrors(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("fake-sentry-token"),
      fetchImpl: () => Promise.reject(new Error("network internals")),
    },
  );

  assertEquals(networkResult.failureReason, "provider_unreachable");
  assert(
    !JSON.stringify(networkResult).includes("network internals"),
    "network error details must not escape",
  );

  const timeoutResult = await checkSentryCriticalErrors(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("fake-sentry-token"),
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
      timeoutMs: 1,
    },
  );

  assertEquals(timeoutResult.failureReason, "provider_timeout");
});

Deno.test("missing, unavailable, or disconnected credentials never call Sentry", async () => {
  let fetchCalled = false;
  const fetchImpl: SentryFetchLike = () => {
    fetchCalled = true;
    return Promise.resolve(new Response("unexpected"));
  };

  const missingRef = await checkSentryCriticalErrors(
    linkedProject,
    { ...linkedConnection, credential_ref: null },
    {
      resolveCredential: () => Promise.resolve("unexpected-secret"),
      fetchImpl,
    },
  );
  assertEquals(missingRef.failureReason, "provider_credential_missing");

  const unavailable = await checkSentryCriticalErrors(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.reject(new Error("vault details")),
      fetchImpl,
    },
  );
  assertEquals(unavailable.failureReason, "provider_credential_unavailable");

  const disconnected = await checkSentryCriticalErrors(
    linkedProject,
    { ...linkedConnection, status: "disconnected" },
    {
      resolveCredential: () => Promise.resolve("unexpected-secret"),
      fetchImpl,
    },
  );
  assertEquals(disconnected.failureReason, "provider_credential_unavailable");
  assertEquals(fetchCalled, false);
});

Deno.test("uses the Sentry organization issues request contract", async () => {
  const captured: { requestUrl?: URL; requestHeaders?: Headers } = {};

  const result = await checkSentryCriticalErrors(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("fake-sentry-token"),
      fetchImpl: (input, init) => {
        captured.requestUrl = new URL(input.toString());
        captured.requestHeaders = new Headers(init?.headers);
        return Promise.resolve(jsonFetch([])(input, init));
      },
    },
  );

  assertEquals(result.status, "healthy");
  const requestUrl = captured.requestUrl;
  const requestHeaders = captured.requestHeaders;
  assert(requestUrl, "Sentry request URL was not captured");
  assertEquals(
    requestUrl.pathname,
    "/api/0/organizations/organization-slug/issues/",
  );
  assertEquals(requestUrl.searchParams.get("project"), "project-slug");
  assertEquals(
    requestUrl.searchParams.get("query"),
    "is:unresolved level:[error,fatal]",
  );
  assertEquals(requestUrl.searchParams.get("statsPeriod"), "24h");
  assertEquals(requestUrl.searchParams.get("sort"), "date");
  assertEquals(requestUrl.searchParams.get("limit"), "100");
  assertEquals(requestUrl.searchParams.get("environment"), null);
  assertEquals(
    requestHeaders?.get("Authorization"),
    "Bearer fake-sentry-token",
  );
  assertEquals(requestHeaders?.get("Accept"), "application/json");
  assertEquals(requestHeaders?.get("User-Agent"), "ClientOps-HealthCheck/1.0");
});

Deno.test("marks conservative and explicit pagination truncation safely", async () => {
  const explicitNext = await checkSentryCriticalErrors(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("fake-sentry-token"),
      fetchImpl: (input, init) =>
        Promise.resolve(
          jsonFetch(
            [],
            200,
            {
              Link:
                '<https://sentry.io/api/0/organizations/organization-slug/issues/?cursor=next>; rel="next"; results="true"',
            },
          )(input, init),
        ),
    },
  );
  assertEquals(explicitNext.snapshot?.truncated, true);

  const exactlyAtLimit = await checkSentryCriticalErrors(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("fake-sentry-token"),
      fetchImpl: jsonFetch(
        Array.from({ length: 100 }, () => ({
          level: "warning",
          lastSeen: "2026-09-01T10:00:00.000Z",
        })),
      ),
    },
  );
  assertEquals(exactlyAtLimit.snapshot?.truncated, true);
});

Deno.test("treats an exhausted or malformed Link header safely", async () => {
  const exhausted = await checkSentryCriticalErrors(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("fake-sentry-token"),
      fetchImpl: (input, init) =>
        Promise.resolve(
          jsonFetch(
            [{ level: "error", lastSeen: "2026-09-01T10:00:00.000Z" }],
            200,
            {
              Link:
                '<https://sentry.io/api/0/organizations/organization-slug/issues/?cursor=previous>; rel="previous"; results="false"',
            },
          )(input, init),
        ),
    },
  );
  assertEquals(exhausted.snapshot?.truncated, false);

  const malformed = await checkSentryCriticalErrors(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("fake-sentry-token"),
      fetchImpl: (input, init) =>
        Promise.resolve(
          jsonFetch(
            [{ level: "error", lastSeen: "2026-09-01T10:00:00.000Z" }],
            200,
            { Link: "not a valid Link header" },
          )(input, init),
        ),
    },
  );
  assertEquals(malformed.status, "degraded");
  assertEquals(malformed.snapshot?.truncated, false);
});

Deno.test("does not include the credential in snapshots or safe failures", async () => {
  const token = "fake-sentry-token";
  const result = await checkSentryCriticalErrors(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve(token),
      fetchImpl: jsonFetch({ error: token }, 500),
    },
  );

  assert(
    !JSON.stringify(result).includes(token),
    "credential must not escape the safe result",
  );
});
