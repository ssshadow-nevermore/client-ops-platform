import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectAuditEvent = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  result: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ProjectMember = {
  id: string;
  user_id: string;
  role_id: string;
  role: string;
  status: string;
  created_at: string;
};

export async function getProjectAuditEvents(
  supabase: SupabaseClient,
  projectId: string,
  limit = 20,
) {
  const { data, error } = await supabase
    .from("audit_events")
    .select("id, user_id, action, entity_type, entity_id, metadata, result, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []) as ProjectAuditEvent[];
}

export async function getProjectMembers(
  supabase: SupabaseClient,
  projectId: string,
) {
  const { data: memberships, error: membershipsError } = await supabase
    .from("project_memberships")
    .select("id, user_id, role_id, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (membershipsError) {
    throw membershipsError;
  }

  const roleIds = (memberships ?? []).map((membership) => membership.role_id);
  const rolesById = new Map<string, string>();

  if (roleIds.length > 0) {
    const { data: roles, error: rolesError } = await supabase
      .from("roles")
      .select("id, key")
      .in("id", roleIds);

    if (rolesError) {
      throw rolesError;
    }

    for (const role of roles ?? []) {
      rolesById.set(role.id, role.key);
    }
  }

  return (memberships ?? []).map((membership) => ({
    ...membership,
    role: rolesById.get(membership.role_id) ?? "UNKNOWN",
  })) as ProjectMember[];
}

export function formatProjectDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatProjectDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}
