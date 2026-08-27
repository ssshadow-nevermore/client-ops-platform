import type { SupabaseClient } from "@supabase/supabase-js";

export async function getPostLoginRoute(
  supabase: SupabaseClient,
): Promise<string> {
  const { data: organizationMembership, error: organizationError } =
    await supabase
      .from("organization_memberships")
      .select("organization_id")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

  if (organizationError) {
    throw organizationError;
  }

  if (organizationMembership) {
    return "/dashboard";
  }

  const { data: projectMembership, error: projectError } =
    await supabase
      .from("project_memberships")
      .select("project_id")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

  if (projectError) {
    throw projectError;
  }

  if (projectMembership) {
    // Пока Project UI ещё не построен.
    // Позже CLIENT будет отправляться сразу в доступный проект.
    return "/dashboard";
  }

  return "/onboarding";
}