import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Icon } from "@/components/ui/icon";
import {
  ButtonLink,
  EmptyState,
  GlassCard,
  SectionHeader,
  StatCard,
  StatusBadge,
} from "@/components/ui/primitives";
import { getAuthenticatedUser } from "@/lib/auth/get-authenticated-user";
import { getDashboardContext } from "@/lib/dashboard/get-dashboard-context";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  if (!user) {
    redirect("/login");
  }

  const context = await getDashboardContext(supabase);

  if (!context) {
    redirect("/onboarding");
  }

  if (context.type === "project") {
    redirect(`/projects/${context.projectId}`);
  }

  const { data: projectRows, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, slug, production_url, status, created_at")
    .eq("organization_id", context.organizationId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (projectsError) {
    throw projectsError;
  }

  const projects = projectRows ?? [];
  const projectCount = projects.length;

  return (
    <AppShell
      organizationName={context.organizationName}
      projectRole={context.role}
      userEmail={user.email}
    >
      <div className="page-container">
        <div className="dashboard-hero">
          <div className="dashboard-hero-copy">
            <p className="eyebrow">Workspace overview</p>
            <h1 className="dashboard-hero-title">{context.organizationName}</h1>
            <p className="dashboard-hero-description">
              Спокойный обзор проектов и точка входа в ежедневное сопровождение. Технические сигналы появятся здесь после подключения модулей.
            </p>
          </div>
          <div className="dashboard-hero-actions">
            <ButtonLink href="/projects/new">
              <Icon name="plus" size={16} /> Добавить проект
            </ButtonLink>
          </div>
        </div>

        <div className="stat-grid">
          <StatCard label="Активные проекты" value={projectCount} detail="Доступны в этом workspace" icon="layers" tone="accent" />
          <StatCard label="Ваш уровень доступа" value={context.role} detail="Организационный контекст" icon="shield" />
          <StatCard label="Project Health" value="Not set" detail="Health checks ещё не настроены" icon="activity" tone="quiet" />
          <StatCard label="Integrations" value="Not configured" detail="Integration backend ещё не настроен" icon="plug" tone="quiet" />
        </div>

        <SectionHeader
          title="Ваши проекты"
          description="Откройте карточку, чтобы перейти к проектному control plane."
          action={projectCount > 0 ? <ButtonLink href="/projects/new" variant="ghost"><Icon name="plus" size={15} /> Новый проект</ButtonLink> : undefined}
        />

        {projectCount > 0 ? (
          <div className="project-grid">
            {projects.map((project) => (
              <GlassCard
                className="project-card"
                href={`/projects/${project.id}`}
                key={project.id}
              >
                <div className="project-card-topline">
                  <div>
                    <h2 className="project-card-title">{project.name}</h2>
                    <p className="project-card-slug">/{project.slug}</p>
                  </div>
                  <StatusBadge label={project.status === "active" ? "Active" : project.status} status={project.status} />
                </div>

                <div className="project-card-url">
                  <Icon className="icon-muted" name="globe" size={14} />
                  <span>{project.production_url ?? "Production URL не подключён"}</span>
                </div>

                <div className="project-card-footer">
                  <span className="project-card-health"><span className="status-badge-dot" /> Health not configured</span>
                  <Icon className="project-card-arrow" name="arrow-up-right" size={16} />
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <EmptyState
            action={<ButtonLink href="/projects/new"><Icon name="plus" size={16} /> Создать первый проект</ButtonLink>}
            description="Добавьте существующий клиентский сайт, чтобы управлять его контекстом, доступом и будущими интеграциями из одного workspace."
            icon="layers"
            title="Проектов пока нет"
          />
        )}
      </div>
    </AppShell>
  );
}
