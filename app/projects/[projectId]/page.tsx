import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BreadcrumbSeparator, Breadcrumbs } from "@/components/nav-link";
import { Icon } from "@/components/ui/icon";
import {
  ButtonLink,
  GlassCard,
  PageHeader,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/primitives";
import { getProjectRequestContext } from "@/lib/projects/get-project-request-context";
import {
  formatHealthTimestamp,
  getHealthStatusLabel,
  getProjectHealth,
} from "@/lib/projects/health";
import { formatProjectDate } from "@/lib/projects/queries";

type ProjectOverviewProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectOverviewPage({ params }: ProjectOverviewProps) {
  const { projectId } = await params;
  const { context, supabase, user } = await getProjectRequestContext(projectId);

  if (!user) redirect("/login");
  if (!context) {
    notFound();
  }

  if (context.role === "CLIENT") {
    redirect(`/projects/${projectId}/content`);
  }

  const project = context.project;
  const health = context.permissions.includes("health.read")
    ? await getProjectHealth(supabase, projectId)
    : null;
  const healthLastChecked = formatHealthTimestamp(health?.last_checked_at);

  return (
    <div className="page-container">
      <Breadcrumbs>
        <Link href="/dashboard">Workspace</Link>
        <BreadcrumbSeparator />
        <span>{project.name}</span>
      </Breadcrumbs>

      <PageHeader
        eyebrow="Project overview"
        title={project.name}
        description="Единая точка обзора проекта: его идентичность, подключённые поверхности и следующие шаги настройки."
        actions={
          <>
            <StatusBadge label={project.status === "active" ? "Active" : project.status} status={project.status} />
            {context.permissions.includes("content.read") && <ButtonLink href={`/projects/${projectId}/content`} variant="secondary"><Icon name="file" size={15} /> Открыть Content</ButtonLink>}
          </>
        }
      >
        <div className="project-identity">
          <span className="project-identity-mark"><Icon name="layers" size={20} /></span>
          <span className="project-identity-copy">
            <span className="project-identity-name">/{project.slug}</span>
            <span className="project-identity-url">{project.production_url ?? "Production URL не подключён"}</span>
          </span>
        </div>
      </PageHeader>

      <div className="detail-grid">
        <GlassCard className="detail-card">
          <SectionHeader title="Project details" description="Данные, которые уже сохранены в Platform Core." />
          <div className="detail-list">
            <div className="detail-row"><span className="meta-label">Name</span><span className="detail-value">{project.name}</span></div>
            <div className="detail-row"><span className="meta-label">Slug</span><span className="detail-value">{project.slug}</span></div>
            <div className="detail-row"><span className="meta-label">Production URL</span>{project.production_url ? <a className="detail-value inline-link" href={project.production_url} rel="noreferrer" target="_blank">{project.production_url} <Icon name="arrow-up-right" size={12} /></a> : <span className="detail-value muted-value">Not connected</span>}</div>
            <div className="detail-row"><span className="meta-label">Status</span><span className="detail-value"><StatusBadge label={project.status === "active" ? "Active" : project.status} status={project.status} compact /></span></div>
            <div className="detail-row"><span className="meta-label">Created</span><span className="detail-value">{formatProjectDate(project.created_at)}</span></div>
          </div>
        </GlassCard>

        <GlassCard className="detail-card">
          <SectionHeader title="Access" description="Текущий project-level context." />
          <div className="detail-list">
            <div className="detail-row"><span className="meta-label">Role</span><span className="detail-value">{context.role}</span></div>
            <div className="detail-row"><span className="meta-label">Project read</span><span className="detail-value"><StatusBadge label="Granted" status="connected" compact /></span></div>
            <div className="detail-row"><span className="meta-label">Technical modules</span><span className="detail-value">{context.permissions.filter((permission) => permission.endsWith(".read")).length} permissions</span></div>
          </div>
        </GlassCard>
      </div>

      <SectionHeader title="Project surfaces" description="Пустые состояния отражают текущую готовность backend-модулей, а не вымышленные показатели." />
      <div className="signal-grid">
        <GlassCard className="signal-card" href={context.permissions.includes("health.read") ? `/projects/${projectId}/health` : undefined} interactive={context.permissions.includes("health.read")}>
          <span className="signal-card-icon"><Icon name="activity" size={17} /></span>
          <h2 className="signal-card-title">Project Health</h2>
          {health ? (
            <div className="project-health-summary">
              <StatusBadge label={getHealthStatusLabel(health.overall_status)} status={health.overall_status} compact />
              <span className="project-health-summary-line">HTTP: {getHealthStatusLabel(health.http_status)}{health.http_status_code !== null ? ` · ${health.http_status_code}` : ""}</span>
              <span className="project-health-summary-muted">{healthLastChecked ? `Last checked ${healthLastChecked}` : "Not checked yet"}</span>
            </div>
          ) : (
            <p className="signal-card-text">Health snapshot unavailable for this project context.</p>
          )}
          {context.permissions.includes("health.read") && <span className="signal-card-action">Открыть Health <Icon name="arrow-up-right" size={13} /></span>}
        </GlassCard>
        <GlassCard className="signal-card" href={context.permissions.includes("content.read") ? `/projects/${projectId}/content` : undefined} interactive={context.permissions.includes("content.read")}>
          <span className="signal-card-icon"><Icon name="file" size={17} /></span>
          <h2 className="signal-card-title">Content</h2>
          <p className="signal-card-text">CMS surface готова к модулям. Content schema и entries ещё не настроены для этого проекта.</p>
          {context.permissions.includes("content.read") && <span className="signal-card-action">Открыть Content <Icon name="arrow-up-right" size={13} /></span>}
        </GlassCard>
        <GlassCard className="signal-card" href={context.permissions.includes("integrations.read") ? `/projects/${projectId}/integrations` : undefined} interactive={context.permissions.includes("integrations.read")}>
          <span className="signal-card-icon"><Icon name="plug" size={17} /></span>
          <h2 className="signal-card-title">Integrations</h2>
          <p className="signal-card-text">GitHub, Vercel, Supabase и Sentry доступны как будущие integration points. OAuth flows пока не включены.</p>
          {context.permissions.includes("integrations.read") && <span className="signal-card-action">Настроить integrations <Icon name="arrow-up-right" size={13} /></span>}
        </GlassCard>
      </div>

      <SectionHeader title="Next steps" description="Минимальная последовательность для подключения существующего сайта." />
      <GlassCard className="callout">
        <Icon className="callout-icon" name="sparkles" size={17} />
        <span>{project.production_url ? "Production URL подключён. Следующий шаг — подключить provider integrations для дополнительных Health signals." : "Добавьте production URL в настройках, затем подключите provider integrations. До этого платформа корректно показывает `Not configured` и не подменяет отсутствие данных фиктивными статусами."}</span>
      </GlassCard>
    </div>
  );
}
