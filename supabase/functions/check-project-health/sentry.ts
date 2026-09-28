/// <reference lib="deno.ns" />

import {
  type CriticalErrorsCheckResult,
  type CriticalErrorsFailureReason,
  getCriticalErrorsHealthStatus,
  type SafeCriticalErrorsSnapshot,
} from "./critical-errors.ts";

const SENTRY_ISSUES_ENDPOINT = "https://sentry.io/api/0/organizations";
const SENTRY_ISSUE_LIMIT = 100;
const DEFAULT_SENTRY_TIMEOUT_MS = 10_000;

export type SentryProjectLink = {
  provider: string;
  external_project_id: string;
};

export type SentryProviderConnection = {
  provider: string;
  external_account_id: string | null;
  credential_ref: string | null;
  status: string;
};

export type SentryFetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type SentryCredentialResolver = (
  credentialRef: string,
) => Promise<string>;

export type SentryProviderOptions = {
  fetchImpl?: SentryFetchLike;
  resolveCredential?: SentryCredentialResolver;
  timeoutMs?: number;
};

export type SentryProviderFailure = Error & {
  code: CriticalErrorsFailureReason;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const normalized = value.trim();

  if (
    normalized.length > 512 ||
    [...normalized].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    return null;
  }

  return normalized;
}

function getProviderError(
  failureReason: CriticalErrorsFailureReason,
): SentryProviderFailure {
  const error = new Error(
    "Sentry critical errors check failed",
  ) as SentryProviderFailure;
  error.name = "SentryProviderError";
  error.code = failureReason;
  return error;
}

function isSentryProviderFailure(
  error: unknown,
): error is SentryProviderFailure {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }

  return typeof error.code === "string" && [
    "provider_timeout",
    "provider_unreachable",
    "provider_auth_failed",
    "invalid_provider_response",
    "provider_credential_missing",
    "provider_credential_unavailable",
  ].includes(error.code);
}

type ParsedSentryIssue = {
  level: string;
  lastSeen: string | null;
  timestamp: number | null;
};

function parseIssue(value: unknown): ParsedSentryIssue | null {
  if (!isRecord(value) || typeof value.level !== "string") {
    return null;
  }

  if (!("lastSeen" in value)) {
    return null;
  }

  const lastSeen = getNonEmptyString(value.lastSeen);

  if (!lastSeen) {
    return null;
  }

  const timestamp = new Date(lastSeen).getTime();

  if (Number.isNaN(timestamp)) {
    return {
      level: value.level.toLowerCase(),
      lastSeen: null,
      timestamp: null,
    };
  }

  return {
    level: value.level.toLowerCase(),
    lastSeen: new Date(timestamp).toISOString(),
    timestamp,
  };
}

function isRelevantIssue(
  issue: ParsedSentryIssue,
): issue is ParsedSentryIssue & { level: "error" | "fatal" } {
  return issue.level === "error" || issue.level === "fatal";
}

function hasSentryNextPage(linkHeader: string | null): boolean {
  if (!linkHeader) {
    return false;
  }

  return linkHeader.split(/,\s*(?=<)/).some((entry) => {
    const relation = entry.match(/\brel="([^"]+)"/i)?.[1];
    const results = entry.match(/\bresults="([^"]+)"/i)?.[1];

    return relation?.toLowerCase() === "next" &&
      results?.toLowerCase() === "true";
  });
}

function hasSentryNextRelation(linkHeader: string | null): boolean {
  return Boolean(
    linkHeader?.split(/,\s*(?=<)/).some((entry) => /\brel="next"/i.test(entry)),
  );
}

function createSafeSnapshot(
  payload: unknown,
  linkHeader: string | null,
): SafeCriticalErrorsSnapshot | null {
  if (!Array.isArray(payload)) {
    return null;
  }

  const parsedIssues = payload.map(parseIssue);

  if (parsedIssues.some((issue) => issue === null)) {
    return null;
  }

  const issues = parsedIssues.filter(
    (issue): issue is ParsedSentryIssue & { level: "error" | "fatal" } =>
      issue !== null && isRelevantIssue(issue),
  );
  const errorCount = issues.filter((issue) => issue.level === "error").length;
  const fatalCount = issues.filter((issue) => issue.level === "fatal").length;
  const latestIssue = issues.reduce<
    {
      lastSeen: string;
      timestamp: number;
    } | null
  >((latest, issue) => {
    if (
      issue.lastSeen === null ||
      issue.timestamp === null ||
      (latest && issue.timestamp <= latest.timestamp)
    ) {
      return latest;
    }

    return {
      lastSeen: issue.lastSeen,
      timestamp: issue.timestamp,
    };
  }, null);
  const truncated = hasSentryNextRelation(linkHeader)
    ? hasSentryNextPage(linkHeader)
    : payload.length >= SENTRY_ISSUE_LIMIT;

  return {
    provider: "sentry",
    window: "24h",
    issue_count: issues.length,
    error_count: errorCount,
    fatal_count: fatalCount,
    truncated,
    latest_seen_at: latestIssue?.lastSeen ?? null,
  };
}

function failure(
  failureReason: CriticalErrorsFailureReason,
): CriticalErrorsCheckResult {
  return {
    status: "unknown",
    snapshot: null,
    failureReason,
  };
}

async function getSentryCredential(
  connection: SentryProviderConnection,
  resolveCredential: SentryCredentialResolver,
): Promise<string> {
  if (!connection.credential_ref) {
    throw getProviderError("provider_credential_missing");
  }

  let token: string;

  try {
    token = await resolveCredential(connection.credential_ref);
  } catch (error) {
    if (isSentryProviderFailure(error)) {
      throw error;
    }

    throw getProviderError("provider_credential_unavailable");
  }

  const normalizedToken = token.trim();

  if (!normalizedToken) {
    throw getProviderError("provider_credential_missing");
  }

  return normalizedToken;
}

async function fetchSentryIssues(
  organization: string,
  project: string,
  token: string,
  options: SentryProviderOptions,
): Promise<{ payload: unknown; linkHeader: string | null }> {
  const endpoint = new URL(
    `${SENTRY_ISSUES_ENDPOINT}/${encodeURIComponent(organization)}/issues/`,
  );
  endpoint.searchParams.set("project", project);
  endpoint.searchParams.set("query", "is:unresolved level:[error,fatal]");
  endpoint.searchParams.set("statsPeriod", "24h");
  endpoint.searchParams.set("sort", "date");
  endpoint.searchParams.set("limit", String(SENTRY_ISSUE_LIMIT));

  const controller = new AbortController();
  const timeoutMs = Math.max(
    1,
    options.timeoutMs ?? DEFAULT_SENTRY_TIMEOUT_MS,
  );
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await (options.fetchImpl ?? fetch)(endpoint, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "ClientOps-HealthCheck/1.0",
      },
    });

    if (response.status === 401 || response.status === 403) {
      throw getProviderError("provider_auth_failed");
    }

    if (!response.ok) {
      throw getProviderError("provider_unreachable");
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw getProviderError("invalid_provider_response");
    }

    return {
      payload,
      linkHeader: response.headers.get("Link"),
    };
  } catch (error) {
    if (isSentryProviderFailure(error)) {
      throw error;
    }

    throw getProviderError(
      controller.signal.aborted ? "provider_timeout" : "provider_unreachable",
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkSentryCriticalErrors(
  link: SentryProjectLink | null,
  connection: SentryProviderConnection | null,
  options: SentryProviderOptions = {},
): Promise<CriticalErrorsCheckResult> {
  if (!link || !connection) {
    return {
      status: "not_configured",
      snapshot: null,
    };
  }

  const organization = getNonEmptyString(connection.external_account_id);
  const project = getNonEmptyString(link.external_project_id);

  if (
    link.provider !== "sentry" ||
    connection.provider !== "sentry" ||
    !organization ||
    !project
  ) {
    return failure("invalid_provider_response");
  }

  if (connection.status === "disconnected") {
    return failure("provider_credential_unavailable");
  }

  const resolveCredential = options.resolveCredential ?? (() => {
    throw getProviderError("provider_credential_unavailable");
  });

  let token: string;

  try {
    token = await getSentryCredential(connection, resolveCredential);
  } catch (error) {
    const code = isSentryProviderFailure(error)
      ? error.code
      : "provider_credential_unavailable";

    return failure(code);
  }

  try {
    const { payload, linkHeader } = await fetchSentryIssues(
      organization,
      project,
      token,
      options,
    );
    const snapshot = createSafeSnapshot(payload, linkHeader);

    if (!snapshot) {
      return failure("invalid_provider_response");
    }

    return {
      status: getCriticalErrorsHealthStatus(
        snapshot.error_count,
        snapshot.fatal_count,
      ),
      snapshot,
    };
  } catch (error) {
    const code = isSentryProviderFailure(error)
      ? error.code
      : "provider_unreachable";

    return failure(code);
  }
}
