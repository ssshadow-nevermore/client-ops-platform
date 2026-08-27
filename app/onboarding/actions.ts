"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function getBootstrapErrorCode(message: string) {
  switch (message) {
    case "invalid_organization_name":
      return "invalid_name";

    case "invalid_organization_slug":
      return "invalid_slug";

    case "invalid_display_name":
      return "invalid_display_name";

    case "organization_slug_unavailable":
      return "slug_unavailable";

    case "organization_bootstrap_not_allowed":
      return "bootstrap_not_allowed";

    case "authentication_required":
      return "authentication_required";

    default:
      return "unknown";
  }
}

export async function createOrganization(formData: FormData) {
  const name = formData.get("name");
  const slug = formData.get("slug");
  const displayName = formData.get("displayName");

  if (
    typeof name !== "string" ||
    typeof slug !== "string" ||
    typeof displayName !== "string"
  ) {
    redirect("/onboarding?error=invalid_form");
  }

  const supabase = await createClient();

  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  if (authError || !authData?.claims?.sub) {
    redirect("/login");
  }

  const { error } = await supabase.rpc(
    "bootstrap_organization",
    {
      target_name: name,
      target_slug: slug,
      target_display_name: displayName || null,
    },
  );

  if (error) {
    const errorCode = getBootstrapErrorCode(error.message);

    if (errorCode === "authentication_required") {
      redirect("/login");
    }

    redirect(`/onboarding?error=${errorCode}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}