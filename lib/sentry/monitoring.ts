import type { ErrorEvent } from "@sentry/nextjs";

// Sentry v11 replaced sendDefaultPii: false with explicit dataCollection controls.
export const errorMonitoringOptions = {
  tracesSampleRate: 0,
  enableLogs: false,
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
    queues: false,
    graphQL: { document: false, variables: false },
    stackFrameVariables: false,
    frameContextLines: 0,
  },
  integrations: (integrations: { name: string }[]) =>
    integrations.filter(
      ({ name }) =>
        name !== "Console" && name !== "Breadcrumbs" && name !== "BrowserTracing",
    ),
  beforeSend: stripRequestData,
};

export function stripRequestData(event: ErrorEvent): ErrorEvent {
  delete event.user;
  delete event.request;
  delete event.breadcrumbs;
  delete event.extra;

  // captureRequestError includes the raw request path, which may contain query data.
  if (event.contexts?.nextjs) {
    delete event.contexts.nextjs.request_path;
  }

  return event;
}
