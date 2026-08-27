"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDashboardContext } from "@/lib/dashboard/get-dashboard-context";
import { createClient } from "@/lib/supabase/server";

import { getAuthenticatedUser } from "@/lib/auth/get-authenticated-user";

function getProjectErrorCode(message: string) {
  switch (message) {
    case "invalid_project_name":
      return "invalid_name";

    case "invalid_project_slug":
      return "invalid_slug";

    case "invalid_production_url":
      return "invalid_url";

    case "project_slug_unavailable":
      return "slug_unavailable";

    case "project_creation_not_allowed":
      return "not_allowed";

    case "authentication_required":
      return "authentication_required";

    default:
      return "unknown";
  }
}

export async function createProject(formData: FormData) {
  const name = formData.get("name");
  const slug = formData.get("slug");
  const productionUrl = formData.get("productionUrl");

  if (
    typeof name !== "string" ||
    typeof slug !== "string" ||
    typeof productionUrl !== "string"
  ) {
    redirect("/projects/new?error=invalid_form");
  }

  const supabase = await createClient();

  const user = await getAuthenticatedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const context = await getDashboardContext(supabase);

  if (
    !context ||
    context.type !== "organization" ||
    context.role !== "OWNER"
  ) {
    redirect("/dashboard");
  }

  const { error } = await supabase.rpc("create_project", {
    target_organization_id: context.organizationId,
    target_name: name,
    target_slug: slug,
    target_production_url: productionUrl || null,
  });

  if (error) {
    const errorCode = getProjectErrorCode(error.message);

    if (errorCode === "authentication_required") {
      redirect("/login");
    }

    redirect(`/projects/new?error=${errorCode}`);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?projectCreated=true");
}