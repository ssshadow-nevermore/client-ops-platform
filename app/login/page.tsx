import { FormField, Button } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";

import { login } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const hasError = params.error === "invalid_credentials";

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <div className="auth-brand">
          <span className="brand-mark"><Icon name="sparkles" size={17} /></span>
          <span className="brand-copy">
            <span className="brand-name">Client Ops</span>
            <span className="brand-caption">Control plane</span>
          </span>
        </div>

        <section aria-labelledby="login-title" className="auth-card">
          <p className="eyebrow">Welcome back</p>
          <h1 className="auth-card-title" id="login-title">Войти в платформу</h1>
          <p className="auth-card-description">
            Единое пространство для проектов, контента и технического контроля.
          </p>

          {hasError && (
            <p className="form-error" role="alert">
              Не удалось войти. Проверьте email и пароль, затем попробуйте ещё раз.
            </p>
          )}

          <form action={login} className="auth-form">
            <FormField id="email" label="Email" required>
              <input
                autoComplete="email"
                className="input"
                id="email"
                name="email"
                placeholder="you@company.com"
                required
                type="email"
              />
            </FormField>

            <FormField id="password" label="Пароль" required>
              <input
                autoComplete="current-password"
                className="input"
                id="password"
                name="password"
                placeholder="Введите пароль"
                required
                type="password"
              />
            </FormField>

            <Button type="submit">
              Войти в workspace <Icon name="arrow-up-right" size={16} />
            </Button>
          </form>
        </section>

        <p className="auth-footer">
          <strong>Server-side session.</strong> Сессия проверяется на сервере.
        </p>
      </div>
    </main>
  );
}
