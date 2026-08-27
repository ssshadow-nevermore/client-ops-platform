import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/ui/icon";
import { Button, FormField, GlassCard, PageHeader } from "@/components/ui/primitives";
import { getAuthenticatedUser } from "@/lib/auth/get-authenticated-user";
import { getDashboardContext } from "@/lib/dashboard/get-dashboard-context";
import { createClient } from "@/lib/supabase/server";

import { createProject } from "./actions";

type NewProjectPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  invalid_form: "Проверьте введённые данные.",
  invalid_name: "Название проекта должно содержать от 2 до 120 символов.",
  invalid_slug: "Slug должен содержать 3–63 символа: строчные латинские буквы, цифры и дефисы.",
  invalid_url: "Production URL должен быть корректным адресом, начинающимся с http:// или https://.",
  slug_unavailable: "Проект с таким slug уже существует в этой организации.",
  not_allowed: "У вас нет прав на создание проекта.",
  unknown: "Не удалось создать проект. Попробуйте ещё раз.",
};

export default async function NewProjectPage({ searchParams }: NewProjectPageProps) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const context = await getDashboardContext(supabase);

  if (!context) {
    redirect("/onboarding");
  }

  if (context.type !== "organization" || context.role !== "OWNER") {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <AppShell
      organizationName={context.organizationName}
      projectRole={context.role}
      userEmail={user.email}
    >
      <div className="page-container">
        <Link className="back-link" href="/dashboard">
          <Icon name="arrow-left" size={15} /> Назад к workspace
        </Link>

        <PageHeader
          eyebrow={context.organizationName}
          title="Новый проект"
          description="Добавьте существующий клиентский сайт в рабочее пространство. Production URL можно подключить позже."
        />

        <GlassCard className="form-card form-card-wide">
          <div className="callout">
            <Icon className="callout-icon" name="shield" size={17} />
            <span>Создание проекта проходит через защищённый server action и secure RPC. Frontend не пишет напрямую в таблицы.</span>
          </div>

          <form action={createProject} className="form-stack mt-24">
            <FormField id="name" label="Название проекта" required>
              <input className="input" id="name" maxLength={120} minLength={2} name="name" placeholder="Парикмахерская Ассоль" required type="text" />
            </FormField>

            <FormField id="slug" label="Project slug" hint="Внутренний идентификатор: строчные латинские буквы, цифры и дефисы." required>
              <input className="input" id="slug" maxLength={63} minLength={3} name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="assol" required type="text" />
            </FormField>

            <FormField id="productionUrl" label="Production URL" hint="Необязательно. Можно добавить, когда сайт будет готов к подключению.">
              <input className="input" id="productionUrl" name="productionUrl" placeholder="https://example.com" type="url" />
            </FormField>

            {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}

            <div className="form-actions">
              <Link className="button button-ghost" href="/dashboard">Отмена</Link>
              <Button type="submit">Создать проект <Icon name="arrow-up-right" size={16} /></Button>
            </div>
          </form>
        </GlassCard>
      </div>
    </AppShell>
  );
}
