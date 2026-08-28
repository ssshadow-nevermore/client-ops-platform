/// <reference lib="deno.ns" />

import { createClient } from "@supabase/supabase-js";

import { checkHttpTarget, HttpCheckError } from "./http.ts";

import {
  type ResolvedProductionTarget,
  UnsafeTargetError,
  validateAndResolveProductionUrl,
} from "./target.ts";

type RequestBody = {
  projectId?: string;
};

type HealthStatus =
  | "not_configured"
  | "unknown"
  | "healthy"
  | "degraded"
  | "critical";

const jsonHeaders = {
  "Content-Type": "application/json",
};

function classifyHttpStatus(
  statusCode: number,
): HealthStatus {
  if (statusCode >= 200 && statusCode < 400) {
    return "healthy";
  }

  if (statusCode >= 400 && statusCode < 500) {
    return "degraded";
  }

  if (statusCode >= 500 && statusCode < 600) {
    return "critical";
  }

  return "unknown";
}

Deno.serve(async (request) => {
  // ============================================================
  // Method
  // ============================================================

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "Method not allowed",
      }),
      {
        status: 405,
        headers: {
          ...jsonHeaders,
          Allow: "POST",
        },
      },
    );
  }

  // ============================================================
  // Authorization header
  // ============================================================

  const authorization = request.headers.get(
    "Authorization",
  );

  if (!authorization) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
      }),
      {
        status: 401,
        headers: jsonHeaders,
      },
    );
  }

  // ============================================================
  // Request body
  // ============================================================

  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({
        error: "Invalid JSON body",
      }),
      {
        status: 400,
        headers: jsonHeaders,
      },
    );
  }

  const projectId = body.projectId?.trim();

  if (!projectId) {
    return new Response(
      JSON.stringify({
        error: "projectId is required",
      }),
      {
        status: 400,
        headers: jsonHeaders,
      },
    );
  }

  // ============================================================
  // Environment
  // ============================================================

  const supabaseUrl = Deno.env.get(
    "SUPABASE_URL",
  );

  const supabaseAnonKey = Deno.env.get(
    "SUPABASE_ANON_KEY",
  );

  const supabaseServiceRoleKey = Deno.env.get(
    "SUPABASE_SERVICE_ROLE_KEY",
  );

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    !supabaseServiceRoleKey
  ) {
    console.error(
      "Missing Supabase environment variables",
    );

    return new Response(
      JSON.stringify({
        error: "Server configuration error",
      }),
      {
        status: 500,
        headers: jsonHeaders,
      },
    );
  }

  // ============================================================
  // User-scoped Supabase client
  //
  // This client uses the caller's JWT.
  // Authentication, authorization and reads therefore continue
  // to obey the existing RLS model.
  // ============================================================

  const userClient = createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  // ============================================================
  // Privileged Supabase client
  //
  // IMPORTANT:
  //
  // This client is NOT used to determine whether the caller has
  // access to the project.
  //
  // It is used only for the controlled project_health write after
  // the user has already passed authentication and RLS checks.
  // ============================================================

  const adminClient = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );

  // ============================================================
  // Authenticate caller
  // ============================================================

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
      }),
      {
        status: 401,
        headers: jsonHeaders,
      },
    );
  }

  // ============================================================
  // Project Health authorization gate
  //
  // project_health SELECT is protected by:
  //
  // has_project_permission(project_id, 'health.read')
  //
  // The caller therefore needs explicit project membership and
  // health.read before the function can continue.
  // ============================================================

  const {
    data: health,
    error: healthError,
  } = await userClient
    .from("project_health")
    .select("project_id")
    .eq("project_id", projectId)
    .maybeSingle();

  if (healthError) {
    console.error(
      "Health authorization lookup failed",
      {
        projectId,
        userId: user.id,
        error: healthError.message,
      },
    );

    return new Response(
      JSON.stringify({
        error: "Unable to verify project access",
      }),
      {
        status: 500,
        headers: jsonHeaders,
      },
    );
  }

  if (!health) {
    /*
     * Do not disclose whether the project actually exists.
     */
    return new Response(
      JSON.stringify({
        error: "Project not found",
      }),
      {
        status: 404,
        headers: jsonHeaders,
      },
    );
  }

  // ============================================================
  // Load project through user RLS
  // ============================================================

  const {
    data: project,
    error: projectError,
  } = await userClient
    .from("projects")
    .select(
      "id, organization_id, production_url, status",
    )
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    console.error(
      "Project lookup failed",
      {
        projectId,
        userId: user.id,
        error: projectError.message,
      },
    );

    return new Response(
      JSON.stringify({
        error: "Unable to load project",
      }),
      {
        status: 500,
        headers: jsonHeaders,
      },
    );
  }

  if (!project) {
    return new Response(
      JSON.stringify({
        error: "Project not found",
      }),
      {
        status: 404,
        headers: jsonHeaders,
      },
    );
  }

  // ============================================================
  // Project state
  // ============================================================

  if (project.status !== "active") {
    return new Response(
      JSON.stringify({
        error: "Project is not active",
      }),
      {
        status: 409,
        headers: jsonHeaders,
      },
    );
  }

  if (!project.production_url) {
    return new Response(
      JSON.stringify({
        error: "Production URL is not configured",
      }),
      {
        status: 409,
        headers: jsonHeaders,
      },
    );
  }

  // ============================================================
  // Production URL validation + DNS resolution
  //
  // SSRF boundary.
  //
  // No outbound HTTP request happens until this succeeds.
  // ============================================================

  let productionTarget: ResolvedProductionTarget;

  try {
    productionTarget = await validateAndResolveProductionUrl(
      project.production_url,
    );
  } catch (error) {
    if (error instanceof UnsafeTargetError) {
      return new Response(
        JSON.stringify({
          error: error.message,
        }),
        {
          status: 400,
          headers: jsonHeaders,
        },
      );
    }

    console.error(
      "Production URL validation failed",
      {
        projectId,
        userId: user.id,
        error,
      },
    );

    return new Response(
      JSON.stringify({
        error: "Unable to validate production URL",
      }),
      {
        status: 500,
        headers: jsonHeaders,
      },
    );
  }

  // ============================================================
  // HTTP Health Check
  // ============================================================

  let httpResult;

  try {
    httpResult = await checkHttpTarget(
      productionTarget,
    );
  } catch (error) {
    if (error instanceof HttpCheckError) {
      const checkedAt = new Date().toISOString();

      /*
       * A failed outbound check is a real HTTP health result.
       *
       * Overall project health remains unknown because HTTP is
       * currently only one of several planned Health signals.
       */
      const {
        data: updatedHealth,
        error: updateError,
      } = await adminClient
        .from("project_health")
        .update({
          overall_status: "unknown",
          http_status: "critical",
          http_status_code: null,
          http_response_time_ms: null,
          last_checked_at: checkedAt,
        })
        .eq("project_id", projectId)
        .eq(
          "organization_id",
          project.organization_id,
        )
        .select("project_id")
        .maybeSingle();

      if (updateError || !updatedHealth) {
        console.error(
          "Unable to persist failed HTTP health check",
          {
            projectId,
            userId: user.id,
            error: updateError?.message,
          },
        );

        return new Response(
          JSON.stringify({
            error: "Unable to persist health result",
          }),
          {
            status: 500,
            headers: jsonHeaders,
          },
        );
      }

      const responseStatus = error.code === "timeout"
        ? 504
        : error.code === "network_error"
        ? 502
        : 400;

      return new Response(
        JSON.stringify({
          error: error.message,
          code: error.code,
        }),
        {
          status: responseStatus,
          headers: jsonHeaders,
        },
      );
    }

    console.error(
      "Unexpected HTTP health check failure",
      {
        projectId,
        userId: user.id,
        error,
      },
    );

    return new Response(
      JSON.stringify({
        error: "HTTP health check failed",
      }),
      {
        status: 500,
        headers: jsonHeaders,
      },
    );
  }

  // ============================================================
  // Classify HTTP response
  // ============================================================

  const httpStatus = classifyHttpStatus(
    httpResult.statusCode,
  );

  const checkedAt = new Date().toISOString();

  // ============================================================
  // Persist successful HTTP response
  //
  // The service-role client performs only this controlled write.
  //
  // Both project_id and organization_id are included so the
  // update cannot accidentally target another tenant.
  // ============================================================

  const {
    data: updatedHealth,
    error: updateError,
  } = await adminClient
    .from("project_health")
    .update({
      /*
       * HTTP is currently only one Health signal.
       *
       * Do not claim that the whole project is healthy until the
       * remaining Health v1 signals have been implemented.
       */
      overall_status: "unknown",

      http_status: httpStatus,
      http_status_code: httpResult.statusCode,
      http_response_time_ms: httpResult.responseTimeMs,

      last_checked_at: checkedAt,
    })
    .eq("project_id", projectId)
    .eq(
      "organization_id",
      project.organization_id,
    )
    .select(
      `
        project_id,
        overall_status,
        http_status,
        http_status_code,
        http_response_time_ms,
        last_checked_at
      `,
    )
    .maybeSingle();

  if (updateError || !updatedHealth) {
    console.error(
      "Unable to persist HTTP health check",
      {
        projectId,
        userId: user.id,
        error: updateError?.message,
      },
    );

    return new Response(
      JSON.stringify({
        error: "Unable to persist health result",
      }),
      {
        status: 500,
        headers: jsonHeaders,
      },
    );
  }

  // ============================================================
  // Result
  // ============================================================

  return new Response(
    JSON.stringify({
      projectId: project.id,

      productionUrl: project.production_url,
      finalUrl: httpResult.finalUrl,

      httpStatus: updatedHealth.http_status,
      statusCode: updatedHealth.http_status_code,
      responseTimeMs: updatedHealth.http_response_time_ms,

      redirectCount: httpResult.redirectCount,
      checkedAt: updatedHealth.last_checked_at,
    }),
    {
      status: 200,
      headers: jsonHeaders,
    },
  );
});
