import { redirect } from "next/navigation";

import { getPostLoginRoute } from "@/lib/auth/get-post-login-route";
import { getAuthenticatedUser } from "@/lib/auth/get-authenticated-user";
import { createClient } from "@/lib/supabase/server";

import { Icon } from "@/components/ui/icon";
import { Button, FormField } from "@/components/ui/primitives";

import { createOrganization } from "./actions";

type OnboardingPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  invalid_form: "Проверьте введённые данные.",
  invalid_name: "Название организации должно содержать от 2 до 120 символов.",
  invalid_slug: "Slug должен содержать 3–63 символа: строчные латинские буквы, цифры и дефисы.",
  invalid_display_name: "Имя пользователя слишком длинное.",
  slug_unavailable: "Такой slug уже занят. Выберите другой.",
  bootstrap_not_allowed: "Для этого аккаунта создание первой организации недоступно.",
  unknown: "Не удалось создать организацию. Попробуйте ещё раз.",
};

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const destination = await getPostLoginRoute(supabase);

  if (destination !== "/onboarding") {
    redirect(destination);
  }

  const params = await searchParams;
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <main className="setup-layout">
      <aside className="setup-aside">
        <div className="setup-aside-content">
          <div className="brand">
            <span className="brand-mark"><Icon name="sparkles" size={17} /></span>
            <span className="brand-copy">
              <span className="brand-name">Client Ops</span>
              <span className="brand-caption">Control plane</span>
            </span>
          </div>

          <p className="eyebrow">Your operating layer</p>
          <h1 className="setup-aside-title">Соберите свой control plane.</h1>
          <p className="setup-aside-description">
            Организация — это ваш workspace для клиентских проектов, доступа команды и прозрачного сопровождения.
          </p>

          <div className="setup-aside-points">
            <div className="setup-point"><span className="setup-point-mark"><Icon name="layers" size={14} /></span> Все проекты в одном рабочем пространстве</div>
            <div className="setup-point"><span className="setup-point-mark"><Icon name="shield" size={14} /></span> Разделение доступа на уровне проекта</div>
            <div className="setup-point"><span className="setup-point-mark"><Icon name="activity" size={14} /></span> Готовая основа для health и audit</div>
          </div>
        </div>
        <p className="setup-aside-footer">Workspace setup · Step 01</p>
      </aside>

      <section className="setup-form-side">
        <div className="setup-form-wrap">
          <div className="setup-form-header">
            <p className="eyebrow">First-time setup</p>
            <h2 className="setup-form-title">Создайте workspace</h2>
            <p className="setup-form-description">
              Начните с названия организации и короткого slug. Остальное можно настроить позже.
            </p>
          </div>

          <form action={createOrganization} className="glass-panel form-card form-stack">
            <FormField id="displayName" label="Ваше имя" hint="Можно изменить в профиле позже.">
              <input autoComplete="name" className="input" id="displayName" maxLength={120} name="displayName" placeholder="Иван" type="text" />
            </FormField>

            <FormField id="name" label="Название организации" required>
              <input className="input" id="name" maxLength={120} minLength={2} name="name" placeholder="Vi Studio" required type="text" />
            </FormField>

            <FormField id="slug" label="Workspace slug" hint="Строчные латинские буквы, цифры и дефисы." required>
              <input className="input" id="slug" maxLength={63} minLength={3} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="vi-studio" required type="text" />
            </FormField>

            {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}

            <Button type="submit">
              Создать workspace <Icon name="arrow-up-right" size={16} />
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
