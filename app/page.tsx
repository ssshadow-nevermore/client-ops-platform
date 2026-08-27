import { redirect } from "next/navigation";

import { getPostLoginRoute } from "@/lib/auth/get-post-login-route";
import { getAuthenticatedUser } from "@/lib/auth/get-authenticated-user";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  redirect(await getPostLoginRoute(supabase));
}
