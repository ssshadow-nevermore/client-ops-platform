import * as Sentry from "@sentry/nextjs";

import { errorMonitoringOptions } from "./lib/sentry/monitoring";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({ dsn, ...errorMonitoringOptions });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
