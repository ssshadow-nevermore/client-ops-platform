import Link from "next/link";
import { redirect } from "next/navigation";

import { getDashboardContext } from "@/lib/dashboard/get-dashboard-context";
import { createClient } from "@/lib/supabase/server";

import { createProject } from "./actions";

import { getAuthenticatedUser } from "@/lib/auth/get-authenticated-user";

type NewProjectPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  invalid_form: "Проверьте введённые данные.",
  invalid_name: "Название проекта должно содержать от 2 до 120 символов.",
  invalid_slug:
    "Slug должен содержать 3–63 символа: строчные латинские буквы, цифры и дефисы.",
  invalid_url:
    "Production URL должен быть корректным адресом, начинающимся с http:// или https://.",
  slug_unavailable:
    "Проект с таким slug уже существует в этой организации.",
  not_allowed: "У вас нет прав на создание проекта.",
  unknown: "Не удалось создать проект. Попробуйте ещё раз.",
};

export default async function NewProjectPage({
  searchParams,
}: NewProjectPageProps) {
  const supabase = await createClient();

  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    redirect("/login");
  }

  const context = await getDashboardContext(supabase);

  if (!context) {
    redirect("/onboarding");
  }

  if (
    context.type !== "organization" ||
    context.role !== "OWNER"
  ) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  const errorMessage = params.error
    ? errorMessages[params.error]
    : undefined;

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard"
          className="text-sm text-gray-600 hover:text-black"
        >
          ← Назад к Dashboard
        </Link>

        <div className="mt-8">
          <p className="text-sm text-gray-500">
            {context.organizationName}
          </p>

          <h1 className="mt-1 text-3xl font-semibold">
            Новый проект
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Добавьте существующий клиентский сайт в рабочее пространство.
          </p>
        </div>

        <form
          action={createProject}
          className="mt-8 space-y-5"
        >
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium"
            >
              Название проекта
            </label>

            <input
              id="name"
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={120}
              className="mt-2 w-full rounded-md border px-3 py-2"
              placeholder="Парикмахерская Ассоль"
            />
          </div>

          <div>
            <label
              htmlFor="slug"
              className="block text-sm font-medium"
            >
              Slug
            </label>

            <input
              id="slug"
              name="slug"
              type="text"
              required
              minLength={3}
              maxLength={63}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              className="mt-2 w-full rounded-md border px-3 py-2"
              placeholder="assol"
            />

            <p className="mt-1 text-xs text-gray-500">
              Используется как внутренний идентификатор проекта.
              Строчные латинские буквы, цифры и дефисы.
            </p>
          </div>

          <div>
            <label
              htmlFor="productionUrl"
              className="block text-sm font-medium"
            >
              Production URL
            </label>

            <input
              id="productionUrl"
              name="productionUrl"
              type="url"
              className="mt-2 w-full rounded-md border px-3 py-2"
              placeholder="https://example.com"
            />

            <p className="mt-1 text-xs text-gray-500">
              Необязательно. Можно добавить позже.
            </p>
          </div>

          {errorMessage && (
            <p className="text-sm text-red-600">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm text-white"
          >
            Создать проект
          </button>
        </form>
      </div>
    </main>
  );
}