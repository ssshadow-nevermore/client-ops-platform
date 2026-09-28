import { describe, expect, it } from "vitest";

import { errorMonitoringOptions, stripRequestData } from "../lib/sentry/monitoring";

describe("Sentry error monitoring privacy", () => {
  it("excludes user data, request data, logs, and tracing", () => {
    expect(errorMonitoringOptions.tracesSampleRate).toBe(0);
    expect(errorMonitoringOptions.enableLogs).toBe(false);
    expect(errorMonitoringOptions.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    });
    expect(
      errorMonitoringOptions.integrations([
        { name: "Console" },
        { name: "Breadcrumbs" },
        { name: "BrowserTracing" },
        { name: "GlobalHandlers" },
      ]),
    ).toEqual([{ name: "GlobalHandlers" }]);
  });

  it("removes request context while retaining the error", () => {
    const event = stripRequestData({
      type: undefined,
      exception: { values: [{ type: "Error", value: "test error" }] },
      user: { email: "private@example.test" },
      request: { url: "https://example.test/?token=private" },
      breadcrumbs: [{ message: "private log" }],
      extra: { form: "private form" },
      contexts: {
        nextjs: { request_path: "/?token=private", route_type: "render" },
      },
    });

    expect(event.user).toBeUndefined();
    expect(event.request).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
    expect(event.extra).toBeUndefined();
    expect(event.contexts?.nextjs).toEqual({ route_type: "render" });
    expect(event.exception?.values?.[0]?.value).toBe("test error");
  });
});
