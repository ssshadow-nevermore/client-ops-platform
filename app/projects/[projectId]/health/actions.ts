"use server";

import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { getAuthenticatedUser } from "@/lib/auth/get-authenticated-user";
import {
  getHealthCheckErrorMessage,
  isPersistedHealthFailure,
} from "@/lib/projects/health-check-action";
import type { HealthStatus } from "@/lib/projects/health";
import { createClient } from "@/lib/supabase/server";

export type HealthCheckResult = {
  projectId: string;
  productionUrl: string;
  finalUrl: string;
  overallStatus: HealthStatus;
  httpStatus: HealthStatus;
  statusCode: number | null;
  responseTimeMs: number | null;
  deploymentStatus: HealthStatus;
  sslStatus: HealthStatus;
  sslExpiresAt: string | null;
  redirectCount: number;
  checkedAt: string | null;
};

export type HealthCheckActionResult =
  | {
      ok: true;
      data: HealthCheckResult;
      snapshotUpdated: true;
    }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      retryAfterSeconds?: number;
      snapshotUpdated: boolean;
    };

type EdgeFunctionErrorPayload = {
  code?: unknown;
  error?: unknown;
  retryAfterSeconds?: unknown;
};

type EdgeFunctionErrorDetails = {
  code: string;
  retryAfterSeconds?: number;
  status: number;
};

async function readEdgeFunctionError(
  error: unknown,
): Promise<EdgeFunctionErrorDetails> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    let payload: EdgeFunctionErrorPayload = {};

    try {
      payload = (await response.clone().json()) as EdgeFunctionErrorPayload;
    } catch {
      // Keep the public fallback message when the function response is not JSON.
    }

    const retryAfterSeconds =
      typeof payload.retryAfterSeconds === "number" &&
      Number.isFinite(payload.retryAfterSeconds)
        ? Math.max(1, Math.ceil(payload.retryAfterSeconds))
        : undefined;

    return {
      code: typeof payload.code === "string" ? payload.code : "function_error",
      retryAfterSeconds,
      status: response.status,
    };
  }

  if (
    error instanceof FunctionsFetchError ||
    error instanceof FunctionsRelayError
  ) {
    return {
      code: "function_unreachable",
      status: 502,
    };
  }

  return {
    code: "function_error",
    status: 500,
  };
}

function revalidateHealthPaths(projectId: string) {
  revalidatePath(`/projects/${projectId}/health`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
}

export async function runProjectHealthCheck(
  projectId: string,
): Promise<HealthCheckActionResult> {
  const normalizedProjectId = projectId.trim();

  if (!normalizedProjectId) {
    return {
      code: "invalid_project_id",
      message: "Project не выбран.",
      ok: false,
      status: 400,
      snapshotUpdated: false,
    };
  }

  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    if (!user) {
      return {
        code: "unauthorized",
        message: getHealthCheckErrorMessage("unauthorized", 401),
        ok: false,
        status: 401,
        snapshotUpdated: false,
      };
    }

    /*
     * The installed Supabase client forwards this server client's current
     * authenticated session JWT as Authorization. The token stays server-side;
     * the client component receives only this action result.
     */
    const { data, error } = await supabase.functions.invoke<HealthCheckResult>(
      "check-project-health",
      {
        body: { projectId: normalizedProjectId },
      },
    );

    if (error) {
      const details = await readEdgeFunctionError(error);
      const snapshotUpdated = isPersistedHealthFailure(details.code);

      // Only health check failures that the Edge Function persisted should
      // refresh the canonical snapshot.
      if (snapshotUpdated) {
        revalidateHealthPaths(normalizedProjectId);
      }

      return {
        code: details.code,
        message: getHealthCheckErrorMessage(
          details.code,
          details.status,
          details.retryAfterSeconds,
        ),
        ...(details.retryAfterSeconds
          ? { retryAfterSeconds: details.retryAfterSeconds }
          : {}),
        ok: false,
        status: details.status,
        snapshotUpdated,
      };
    }

    revalidateHealthPaths(normalizedProjectId);

    return {
      data: data as HealthCheckResult,
      ok: true,
      snapshotUpdated: true,
    };
  } catch {
    return {
      code: "unexpected_error",
      message: getHealthCheckErrorMessage("unexpected_error", 500),
      ok: false,
      status: 500,
      snapshotUpdated: false,
    };
  }
}
