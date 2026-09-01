import Link from "next/link";
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
import {
  getHealthAttentionReason,
  getHealthStatusPriority,
  getHealthStatusLabel,
  getProjectHealthByProjectIds,
  getOperationalHealthStatus,
  getPortfolioBadgeStatus,
  getPortfolioStatus,
  getPortfolioStatusLabel,
  type PortfolioStatus,
} from "@/lib/projects/health";
import { createClient } from "@/lib/supabase/server";

import { DashboardHealthRefresh } from "./dashboard-health-refresh";

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
    .order("created_at", { ascending: false });

  if (projectsError) {
    throw projectsError;
  }

  const projects = projectRows ?? [];
  const projectCount = projects.length;
  const activeProjectCount = projects.filter(
    (project) => project.status === "active",
  ).length;
  const healthRefreshProjectIds = projects
    .filter(
      (project) => project.status === "active" && Boolean(project.production_url),
    )
    .map((project) => project.id);
  const healthByProjectId = await getProjectHealthByProjectIds(
    supabase,
    projects.map((project) => project.id),
  );
  const operationalProjects = [...projects].sort((left, right) => {
    const leftStatus = getOperationalHealthStatus(
      healthByProjectId.get(left.id),
    );
    const rightStatus = getOperationalHealthStatus(
      healthByProjectId.get(right.id),
    );
    const priorityDifference =
      getHealthStatusPriority(leftStatus) - getHealthStatusPriority(rightStatus);

    return priorityDifference || right.created_at.localeCompare(left.created_at);
  });
  const projectOperationalRows = operationalProjects.map((project) => {
    const health = healthByProjectId.get(project.id) ?? null;
    const operationalStatus = getOperationalHealthStatus(health);
    const portfolioStatus = getPortfolioStatus(operationalStatus);

    return {
      health,
      operationalStatus,
      portfolioStatus,
      project,
    };
  });
  const activeProjectOperationalRows = projectOperationalRows.filter(
    ({ project }) => project.status === "active",
  );
  const activePortfolioCounts: Record<PortfolioStatus, number> = {
    healthy: 0,
    needs_attention: 0,
    not_configured: 0,
    unknown: 0,
  };

  for (const { portfolioStatus } of activeProjectOperationalRows) {
    activePortfolioCounts[portfolioStatus] += 1;
  }
  const activeAttentionProjects = activeProjectOperationalRows.flatMap((row) => {
    const reason = getHealthAttentionReason(row.health);

    return row.portfolioStatus === "needs_attention" && reason
      ? [{ ...row, reason }]
      : [];
  });
  const portfolioStatusOrder: PortfolioStatus[] = [
    "needs_attention",
    "unknown",
    "not_configured",
    "healthy",
  ];

  return (
    <AppShell
      organizationName={context.organizationName}
      projectRole={context.role}
      userEmail={user.email}
    >
      <DashboardHealthRefresh projectIds={healthRefreshProjectIds} />
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
          <StatCard label="Активные проекты" value={activeProjectCount} detail="Доступны в этом workspace" icon="layers" tone="accent" />
          <StatCard label="Ваш уровень доступа" value={context.role} detail="Организационный контекст" icon="shield" />
          <StatCard label="Project Health" value="Not set" detail="Workspace aggregate deferred" icon="activity" tone="quiet" />
          <StatCard label="Integrations" value="Not configured" detail="Integration backend ещё не настроен" icon="plug" tone="quiet" />
        </div>

        <div className="dashboard-operations-grid">
          <GlassCard className="dashboard-operations-card">
            <div className="dashboard-operations-header">
              <div>
                <p className="eyebrow">Portfolio</p>
                <h2 className="dashboard-operations-title">Portfolio Status</h2>
                <p className="dashboard-operations-description">
                  Приоритеты собраны из canonical project health snapshots.
                </p>
              </div>
              <span className="stat-card-icon"><Icon name="activity" size={17} /></span>
            </div>
            <div className="portfolio-status-list">
              {portfolioStatusOrder.map((portfolioStatus) => {
                const representativeStatus = portfolioStatus === "needs_attention"
                  ? "critical"
                  : portfolioStatus;
                const badgeStatus = getPortfolioBadgeStatus(
                  portfolioStatus,
                  representativeStatus,
                );

                return (
                  <div className="portfolio-status-row" key={portfolioStatus}>
                    <StatusBadge
                      compact
                      label={getPortfolioStatusLabel(portfolioStatus)}
                      status={badgeStatus}
                    />
                    <strong className="portfolio-status-count">
                      {activePortfolioCounts[portfolioStatus]}
                    </strong>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard className="dashboard-operations-card">
            <div className="dashboard-operations-header">
              <div>
                <p className="eyebrow">Operational queue</p>
                <h2 className="dashboard-operations-title">Needs Attention</h2>
                <p className="dashboard-operations-description">
                  Только проекты с recorded critical или degraded overall health.
                </p>
              </div>
              <span className="stat-card-icon"><Icon name="shield" size={17} /></span>
            </div>

            {activeAttentionProjects.length > 0 ? (
              <div className="attention-project-list">
                {activeAttentionProjects.map(({ project, reason }) => (
                  <Link className="attention-project-item" href={`/projects/${project.id}`} key={project.id}>
                    <span className="attention-project-copy">
                      <span className="attention-project-name">{project.name}</span>
                      <span className="attention-project-reason">{reason}</span>
                    </span>
                    <Icon className="project-card-arrow" name="arrow-up-right" size={15} />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dashboard-inline-empty">
                <span className="dashboard-inline-empty-title">No recorded attention items</span>
                <span>Critical и degraded overall health не обнаружены в доступных snapshots.</span>
              </div>
            )}
          </GlassCard>
        </div>

        <SectionHeader
          title="All Projects"
          description="Операционный список, отсортированный по текущему Health status."
          action={projectCount > 0 ? <ButtonLink href="/projects/new" variant="ghost"><Icon name="plus" size={15} /> Новый проект</ButtonLink> : undefined}
        />

        {projectCount > 0 ? (
          <div className="project-grid">
            {projectOperationalRows.map(({ health, operationalStatus, portfolioStatus, project }) => {
              const badgeStatus = getPortfolioBadgeStatus(
                portfolioStatus,
                operationalStatus,
              );

              return (
                <GlassCard
                  className="project-card"
                  href={`/projects/${project.id}`}
                  key={project.id}
                >
                  <div className="project-card-topline">
                    <div>
                      <h2 className="project-card-title">{project.name}</h2>
                      <p className="project-card-slug">
                        /{project.slug} · Lifecycle: {project.status}
                      </p>
                    </div>
                    <StatusBadge
                      label={getPortfolioStatusLabel(portfolioStatus)}
                      status={badgeStatus}
                    />
                  </div>

                  <div className="project-card-url">
                    <Icon className="icon-muted" name="globe" size={14} />
                    <span>{project.production_url ?? "Production URL не подключён"}</span>
                  </div>

                  <div className="project-card-footer">
                    <span className="project-card-health">
                      <span className={`status-badge-dot status-dot-${badgeStatus}`} />
                      Health: {getPortfolioStatusLabel(portfolioStatus)}
                    </span>
                    {health && (
                      <span className="project-card-http">
                        HTTP: {getHealthStatusLabel(health.http_status)}{health.http_status_code !== null ? ` · ${health.http_status_code}` : ""} · SSL: {getHealthStatusLabel(health.ssl_status)}
                      </span>
                    )}
                    <Icon className="project-card-arrow" name="arrow-up-right" size={16} />
                  </div>
                </GlassCard>
              );
            })}
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
