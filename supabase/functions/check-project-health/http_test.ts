/// <reference lib="deno.ns" />

import { checkHttpTarget, type FetchLike, HttpCheckError } from "./http.ts";

import type { ResolvedProductionTarget } from "./target.ts";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
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

function createTarget(
  url = "https://93.184.216.34/",
): ResolvedProductionTarget {
  return {
    url: new URL(url),
    addresses: ["93.184.216.34"],
  };
}

Deno.test("returns successful HTTP result", async () => {
  const fetchMock: FetchLike = () =>
    Promise.resolve(
      new Response(null, {
        status: 200,
      }),
    );

  const result = await checkHttpTarget(
    createTarget(),
    fetchMock,
  );

  assertEquals(result.statusCode, 200);
  assertEquals(result.redirectCount, 0);
  assertEquals(
    result.finalUrl,
    "https://93.184.216.34/",
  );

  assert(
    result.responseTimeMs >= 0,
    "response time must be non-negative",
  );
});

Deno.test("returns HTTP error status as a result", async () => {
  const fetchMock: FetchLike = () =>
    Promise.resolve(
      new Response(null, {
        status: 503,
      }),
    );

  const result = await checkHttpTarget(
    createTarget(),
    fetchMock,
  );

  assertEquals(result.statusCode, 503);
});

Deno.test("follows safe redirect", async () => {
  let callCount = 0;

  const fetchMock: FetchLike = () => {
    callCount += 1;

    if (callCount === 1) {
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: {
            Location: "https://93.184.216.34/final",
          },
        }),
      );
    }

    return Promise.resolve(
      new Response(null, {
        status: 200,
      }),
    );
  };

  const result = await checkHttpTarget(
    createTarget(),
    fetchMock,
  );

  assertEquals(result.statusCode, 200);
  assertEquals(result.redirectCount, 1);
  assertEquals(
    result.finalUrl,
    "https://93.184.216.34/final",
  );
});

Deno.test("rejects redirect to localhost", async () => {
  const fetchMock: FetchLike = () =>
    Promise.resolve(
      new Response(null, {
        status: 302,
        headers: {
          Location: "http://127.0.0.1/",
        },
      }),
    );

  try {
    await checkHttpTarget(
      createTarget(),
      fetchMock,
    );
  } catch (error) {
    assert(
      error instanceof HttpCheckError,
      "Expected HttpCheckError",
    );

    assertEquals(
      error.code,
      "invalid_redirect",
    );

    return;
  }

  throw new Error(
    "Expected private redirect to be rejected",
  );
});

Deno.test("stops after redirect limit", async () => {
  const fetchMock: FetchLike = (input) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );

    const redirectNumber = Number(
      url.searchParams.get("redirect") ?? "0",
    );

    return Promise.resolve(
      new Response(null, {
        status: 302,
        headers: {
          Location: `https://93.184.216.34/?redirect=${redirectNumber + 1}`,
        },
      }),
    );
  };

  try {
    await checkHttpTarget(
      createTarget(
        "https://93.184.216.34/?redirect=0",
      ),
      fetchMock,
    );
  } catch (error) {
    assert(
      error instanceof HttpCheckError,
      "Expected HttpCheckError",
    );

    assertEquals(
      error.code,
      "redirect_limit",
    );

    return;
  }

  throw new Error(
    "Expected redirect limit error",
  );
});

Deno.test("accepts redirect status without Location as final result", async () => {
  const fetchMock: FetchLike = () =>
    Promise.resolve(
      new Response(null, {
        status: 302,
      }),
    );

  const result = await checkHttpTarget(
    createTarget(),
    fetchMock,
  );

  assertEquals(result.statusCode, 302);
  assertEquals(result.redirectCount, 0);
});
