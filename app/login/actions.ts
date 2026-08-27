"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPostLoginRoute } from "@/lib/auth/get-post-login-route";

import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    email.trim() === "" ||
    password === ""
  ) {
    redirect("/login?error=invalid_credentials");
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    redirect("/login?error=invalid_credentials");
  }
  const destination = await getPostLoginRoute(supabase);

  revalidatePath("/", "layout");
  redirect(destination);
}