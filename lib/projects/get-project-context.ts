import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectContext = {
  project: {
    id: string;
    organization_id: string;
    name: string;
    slug: string;
    production_url: string | null;
    status: string;
    created_at: string;
  };
  organizationName: string;
  role: string;
  permissions: string[];
};

export async function getProjectContext(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<ProjectContext | null> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, organization_id, name, slug, production_url, status, created_at")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw projectError;
  }

  if (!project) {
    return null;
  }

  const { data: membership, error: membershipError } = await supabase
    .from("project_memberships")
    .select("role_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError) {
    throw membershipError;
  }

  if (!membership) {
    return null;
  }

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", project.organization_id)
    .maybeSingle();

  if (organizationError) {
    throw organizationError;
  }

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("key")
    .eq("id", membership.role_id)
    .maybeSingle();

  if (roleError) {
    throw roleError;
  }

  const { data: rolePermissions, error: rolePermissionsError } = await supabase
    .from("role_permissions")
    .select("permission_id")
    .eq("role_id", membership.role_id);

  if (rolePermissionsError) {
    throw rolePermissionsError;
  }

  const permissionIds = (rolePermissions ?? []).map((item) => item.permission_id);
  let permissions: string[] = [];

  if (permissionIds.length > 0) {
    const { data: permissionRows, error: permissionsError } = await supabase
      .from("permissions")
      .select("key")
      .in("id", permissionIds);

    if (permissionsError) {
      throw permissionsError;
    }

    permissions = (permissionRows ?? []).map((item) => item.key);
  }

  return {
    project,
    organizationName: organization?.name ?? "Project workspace",
    role: role?.key ?? "UNKNOWN",
    permissions,
  };
}

export function hasProjectPermission(
  context: ProjectContext,
  permission: string,
) {
  return context.permissions.includes(permission);
}
