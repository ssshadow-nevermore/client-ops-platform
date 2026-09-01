/// <reference lib="deno.ns" />

import {
  checkVercelProductionDeployment,
  getVercelDeploymentHealthStatus,
  normalizeVercelDeploymentState,
  type VercelFetchLike,
} from "./vercel.ts";

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

const linkedProject = {
  provider: "vercel",
  external_project_id: "vercel-project-1",
};

const linkedConnection = {
  provider: "vercel",
  external_account_id: "team_1",
  credential_ref: "550e8400-e29b-41d4-a716-446655440000",
  status: "connected",
};

function jsonFetch(payload: unknown): VercelFetchLike {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
}

Deno.test("maps every supported Vercel deployment state", () => {
  const cases = [
    ["READY", "healthy"],
    ["ERROR", "degraded"],
    ["BLOCKED", "degraded"],
    ["CANCELED", "degraded"],
    ["QUEUED", "unknown"],
    ["INITIALIZING", "unknown"],
    ["BUILDING", "unknown"],
  ] as const;

  for (const [state, expected] of cases) {
    assertEquals(
      getVercelDeploymentHealthStatus(state),
      expected,
      `${state} must map to ${expected}`,
    );
  }
});

Deno.test("normalizes supported Vercel states into safe snapshot states", () => {
  assertEquals(normalizeVercelDeploymentState("READY"), "ready");
  assertEquals(normalizeVercelDeploymentState("CANCELED"), "canceled");
  assertEquals(normalizeVercelDeploymentState("future_state"), "unknown");
});

Deno.test("missing connection or project link is not configured", async () => {
  for (
    const [link, connection] of [
      [null, null],
      [linkedProject, null],
      [null, linkedConnection],
    ] as const
  ) {
    const result = await checkVercelProductionDeployment(link, connection);

    assertEquals(result.status, "not_configured");
    assertEquals(result.snapshot, null);
  }
});

Deno.test("configured provider with no deployment is unknown", async () => {
  const result = await checkVercelProductionDeployment(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("vercel-test-token"),
      fetchImpl: jsonFetch({ deployments: [] }),
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.snapshot, null);
});

Deno.test("requests one production deployment for the linked Vercel project", async () => {
  const captured: {
    requestUrl: URL | null;
    authorization: string | null;
    credentialRef: string | null;
  } = {
    requestUrl: null,
    authorization: null,
    credentialRef: null,
  };

  const result = await checkVercelProductionDeployment(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: (credentialRef) => {
        captured.credentialRef = credentialRef;
        return Promise.resolve("vercel-test-token");
      },
      fetchImpl: (input, init) => {
        captured.requestUrl = new URL(input.toString());
        captured.authorization = init?.headers
          ? new Headers(init.headers).get("Authorization")
          : null;

        return Promise.resolve(jsonFetch({ deployments: [] })(input, init));
      },
    },
  );

  assertEquals(result.status, "unknown");
  const requestUrl = captured.requestUrl;
  assert(requestUrl, "Vercel request URL was not captured");
  assertEquals(requestUrl.pathname, "/v6/deployments");
  assertEquals(requestUrl.searchParams.get("projectId"), "vercel-project-1");
  assertEquals(requestUrl.searchParams.get("target"), "production");
  assertEquals(requestUrl.searchParams.get("limit"), "1");
  assertEquals(requestUrl.searchParams.get("teamId"), "team_1");
  assertEquals(captured.credentialRef, linkedConnection.credential_ref);
  assertEquals(captured.authorization, "Bearer vercel-test-token");
});

Deno.test("normalizes the latest production deployment without raw response fields", async () => {
  const result = await checkVercelProductionDeployment(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("vercel-test-token"),
      fetchImpl: jsonFetch({
        deployments: [{
          uid: "dpl_123",
          state: "READY",
          createdAt: 1788220800000,
          secretBuildLog: "must not persist",
        }],
        rawSensitiveField: "must not persist",
      }),
    },
  );

  assertEquals(result.status, "healthy");
  assert(result.snapshot, "snapshot is required");
  assertEquals(result.snapshot.provider, "vercel");
  assertEquals(result.snapshot.deployment_id, "dpl_123");
  assertEquals(result.snapshot.state, "ready");
  assertEquals(result.snapshot.created_at, "2026-09-01T00:00:00.000Z");
  assert(
    !JSON.stringify(result).includes("must not persist"),
    "raw provider fields must not be included in normalized output",
  );
  assert(
    !JSON.stringify(result).includes("vercel-test-token"),
    "provider token must not be included in normalized output",
  );
});

Deno.test("provider timeout becomes unknown with a safe reason", async () => {
  const result = await checkVercelProductionDeployment(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("vercel-test-token"),
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
      timeoutMs: 1,
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.failureReason, "provider_timeout");
});

Deno.test("provider network failure becomes unknown with a safe reason", async () => {
  const result = await checkVercelProductionDeployment(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("vercel-test-token"),
      fetchImpl: () =>
        Promise.reject(new Error("network details must not escape")),
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.failureReason, "provider_unreachable");
  assert(
    !JSON.stringify(result).includes("network details"),
    "provider network details must not escape",
  );
});

Deno.test("provider auth failure becomes unknown with a safe reason", async () => {
  const authFetch: VercelFetchLike = () =>
    Promise.resolve(
      new Response(JSON.stringify({ error: "secret provider response" }), {
        status: 401,
      }),
    );

  const authResult = await checkVercelProductionDeployment(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("vercel-test-token"),
      fetchImpl: authFetch,
    },
  );

  assertEquals(authResult.status, "unknown");
  assertEquals(authResult.failureReason, "provider_auth_failed");
  assert(
    !JSON.stringify(authResult).includes("secret provider response"),
    "provider response details must not escape",
  );
});

Deno.test("malformed provider response becomes unknown", async () => {
  const result = await checkVercelProductionDeployment(
    linkedProject,
    linkedConnection,
    {
      resolveCredential: () => Promise.resolve("vercel-test-token"),
      fetchImpl: jsonFetch({ deployments: [{ uid: "missing-state" }] }),
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.failureReason, "invalid_provider_response");
});

Deno.test("missing secure credential resolver fails closed without using the reference as a token", async () => {
  let fetchCalled = false;

  const result = await checkVercelProductionDeployment(
    linkedProject,
    linkedConnection,
    {
      fetchImpl: () => {
        fetchCalled = true;
        return Promise.resolve(new Response("unexpected"));
      },
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.failureReason, "provider_credential_unavailable");
  assert(
    !fetchCalled,
    "provider must not be called without resolved credential",
  );
});

Deno.test("missing credential reference becomes unknown without a provider request", async () => {
  let fetchCalled = false;

  const result = await checkVercelProductionDeployment(
    linkedProject,
    {
      ...linkedConnection,
      credential_ref: null,
    },
    {
      resolveCredential: () => Promise.resolve("unexpected-secret"),
      fetchImpl: () => {
        fetchCalled = true;
        return Promise.resolve(new Response("unexpected"));
      },
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.failureReason, "provider_credential_missing");
  assertEquals(fetchCalled, false);
});

Deno.test("disconnected provider does not resolve credentials or call Vercel", async () => {
  let resolverCalled = false;
  let fetchCalled = false;

  const result = await checkVercelProductionDeployment(
    linkedProject,
    {
      ...linkedConnection,
      status: "disconnected",
    },
    {
      resolveCredential: () => {
        resolverCalled = true;
        return Promise.resolve("unexpected-secret");
      },
      fetchImpl: () => {
        fetchCalled = true;
        return Promise.resolve(new Response("unexpected"));
      },
    },
  );

  assertEquals(result.status, "unknown");
  assertEquals(result.failureReason, "provider_credential_unavailable");
  assertEquals(resolverCalled, false);
  assertEquals(fetchCalled, false);
});
