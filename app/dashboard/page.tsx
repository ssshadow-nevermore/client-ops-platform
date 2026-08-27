import { redirect } from "next/navigation";

import { getDashboardContext } from "@/lib/dashboard/get-dashboard-context";
import { createClient } from "@/lib/supabase/server";

import { logout } from "./actions";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  if (authError || !authData?.claims?.sub) {
    redirect("/login");
  }

  const context = await getDashboardContext(supabase);

  if (!context) {
    redirect("/onboarding");
  }

  if (context.type === "project") {
    return (
      <main className="min-h-screen p-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-sm text-gray-500">
                Проект
              </p>

              <h1 className="mt-1 text-3xl font-semibold">
                {context.projectName}
              </h1>

              <p className="mt-2 text-sm text-gray-600">
                Роль: {context.role}
              </p>
            </div>

            <form action={logout}>
              <button
                type="submit"
                className="rounded-md border px-4 py-2 text-sm"
              >
                Выйти
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  const { count: projectCount, error: projectCountError } =
    await supabase
      .from("projects")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("organization_id", context.organizationId)
      .eq("status", "active");

  if (projectCountError) {
    throw projectCountError;
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-start justify-between gap-6">
          <div>
            <p className="text-sm text-gray-500">
              Рабочее пространство
            </p>

            <h1 className="mt-1 text-3xl font-semibold">
              {context.organizationName}
            </h1>

            <p className="mt-2 text-sm text-gray-600">
              Роль: {context.role}
            </p>
          </div>

          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border px-4 py-2 text-sm"
            >
              Выйти
            </button>
          </form>
        </header>

        <section className="mt-10">
          <div className="rounded-lg border p-6">
            <p className="text-sm text-gray-500">
              Активные проекты
            </p>

            <p className="mt-2 text-3xl font-semibold">
              {projectCount ?? 0}
            </p>
          </div>
        </section>

        {(projectCount ?? 0) === 0 && (
          <section className="mt-8 rounded-lg border border-dashed p-8">
            <h2 className="text-lg font-semibold">
              Проектов пока нет
            </h2>

            <p className="mt-2 max-w-xl text-sm text-gray-600">
              Добавьте первый клиентский сайт, чтобы начать
              управлять его состоянием, контентом и интеграциями.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}