import { login } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const params = await searchParams;
  const hasError = params.error === "invalid_credentials";

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold">
          Client Ops Platform
        </h1>

        <p className="mt-2 text-sm text-gray-600">
          Войдите в свой аккаунт.
        </p>

        {hasError && (
          <p
            role="alert"
            className="mt-4 text-sm text-red-600"
          >
            Не удалось войти. Проверьте данные и попробуйте снова.
          </p>
        )}

        <form
          action={login}
          className="mt-6 space-y-4"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium"
            >
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium"
            >
              Пароль
            </label>

            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-black px-4 py-2 text-white"
          >
            Войти
          </button>
        </form>
      </div>
    </main>
  );
}