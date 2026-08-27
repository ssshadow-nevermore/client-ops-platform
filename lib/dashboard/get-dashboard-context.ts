import type { SupabaseClient } from "@supabase/supabase-js";

type OrganizationDashboardContext = {
  type: "organization";
  organizationId: string;
  organizationName: string;
  role: string;
};

type ProjectDashboardContext = {
  type: "project";
  projectId: string;
  projectName: string;
  role: string;
};

export type DashboardContext =
  | OrganizationDashboardContext
  | ProjectDashboardContext;

export async function getDashboardContext(
  supabase: SupabaseClient,
): Promise<DashboardContext | null> {
  const {
    data: organizationMembership,
    error: organizationMembershipError,
  } = await supabase
    .from("organization_memberships")
    .select("organization_id, role")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (organizationMembershipError) {
    throw organizationMembershipError;
  }

  if (organizationMembership) {
    const { data: organization, error: organizationError } =
      await supabase
        .from("organizations")
        .select("id, name")
        .eq("id", organizationMembership.organization_id)
        .single();

    if (organizationError) {
      throw organizationError;
    }

    return {
      type: "organization",
      organizationId: organization.id,
      organizationName: organization.name,
      role: organizationMembership.role,
    };
  }

  const {
    data: projectMembership,
    error: projectMembershipError,
  } = await supabase
    .from("project_memberships")
    .select("project_id, role_id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (projectMembershipError) {
    throw projectMembershipError;
  }

  if (!projectMembership) {
    return null;
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectMembership.project_id)
    .single();

  if (projectError) {
    throw projectError;
  }

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("key")
    .eq("id", projectMembership.role_id)
    .single();

  if (roleError) {
    throw roleError;
  }

  return {
    type: "project",
    projectId: project.id,
    projectName: project.name,
    role: role.key,
  };
}