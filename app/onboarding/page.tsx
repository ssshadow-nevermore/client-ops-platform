import { redirect } from "next/navigation";

import { getPostLoginRoute } from "@/lib/auth/get-post-login-route";
import { createClient } from "@/lib/supabase/server";

import { createOrganization } from "./actions";

type OnboardingPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  invalid_form: "Проверьте введённые данные.",
  invalid_name: "Название организации должно содержать от 2 до 120 символов.",
  invalid_slug:
    "Slug должен содержать 3–63 символа: строчные латинские буквы, цифры и дефисы.",
  invalid_display_name: "Имя пользователя слишком длинное.",
  slug_unavailable: "Такой slug уже занят. Выберите другой.",
  bootstrap_not_allowed:
    "Для этого аккаунта создание первой организации недоступно.",
  unknown: "Не удалось создать организацию. Попробуйте ещё раз.",
};

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    redirect("/login");
  }

  const destination = await getPostLoginRoute(supabase);

  if (destination !== "/onboarding") {
    redirect(destination);
  }

  const params = await searchParams;
  const errorMessage = params.error
    ? errorMessages[params.error]
    : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <h1 className="text-2xl font-semibold">
          Настройка рабочего пространства
        </h1>

        <p className="mt-2 text-sm text-gray-600">
          Создайте свою первую организацию, чтобы начать добавлять проекты.
        </p>

        <form
          action={createOrganization}
          className="mt-8 space-y-5"
        >
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium"
            >
              Ваше имя
            </label>

            <input
              id="displayName"
              name="displayName"
              type="text"
              autoComplete="name"
              maxLength={120}
              className="mt-2 w-full rounded-md border px-3 py-2"
              placeholder="Иван"
            />
          </div>

          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium"
            >
              Название организации
            </label>

            <input
              id="name"
              name="name"
              type="text"
              required
              minLength={2}
              maxLength={120}
              className="mt-2 w-full rounded-md border px-3 py-2"
              placeholder="Vi Studio"
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
              placeholder="vi-studio"
            />

            <p className="mt-1 text-xs text-gray-500">
              Строчные латинские буквы, цифры и дефисы.
            </p>
          </div>

          {errorMessage && (
            <p className="text-sm text-red-600">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-md bg-black px-4 py-2 text-white"
          >
            Создать рабочее пространство
          </button>
        </form>
      </div>
    </main>
  );
}