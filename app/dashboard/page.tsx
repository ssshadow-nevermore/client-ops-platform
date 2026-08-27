import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { logout } from "./actions";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">
        Dashboard
      </h1>

      <p className="mt-2 text-sm text-gray-600">
        Вы авторизованы.
      </p>

      <form action={logout} className="mt-6">
        <button
          type="submit"
          className="rounded-md border px-4 py-2"
        >
          Выйти
        </button>
      </form>
    </main>
  );
}