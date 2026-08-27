import { notFound, redirect } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { GlassCard, PageHeader, SectionHeader, StatusBadge } from "@/components/ui/primitives";
import { hasProjectPermission } from "@/lib/projects/get-project-context";
import { formatProjectDate } from "@/lib/projects/queries";
import { getProjectRequestContext } from "@/lib/projects/get-project-request-context";

type SettingsPageProps = { params: Promise<{ projectId: string }> };

export default async function SettingsPage({ params }: SettingsPageProps) {
  const { projectId } = await params;
  const { context, user } = await getProjectRequestContext(projectId);

  if (!user) redirect("/login");
  if (!context) notFound();
  if (!hasProjectPermission(context, "settings.read")) redirect(`/projects/${projectId}`);

  const project = context.project;

  return (
    <div className="page-container">
      <PageHeader eyebrow={project.name} title="Project settings" description="Базовые project metadata и будущая точка настройки доступа, provider connections и статуса." />

      <GlassCard className="detail-card">
        <SectionHeader title="Project metadata" description="Читаем реальные поля из Platform Core. Edit flow пока не добавлен." />
        <div className="detail-list">
          <div className="detail-row"><span className="meta-label">Project name</span><span className="detail-value">{project.name}</span></div>
          <div className="detail-row"><span className="meta-label">Slug</span><span className="detail-value">{project.slug}</span></div>
          <div className="detail-row"><span className="meta-label">Production URL</span><span className="detail-value">{project.production_url ?? <span className="muted-value">Not connected</span>}</span></div>
          <div className="detail-row"><span className="meta-label">Status</span><span className="detail-value"><StatusBadge label={project.status} status={project.status} compact /></span></div>
          <div className="detail-row"><span className="meta-label">Created</span><span className="detail-value">{formatProjectDate(project.created_at)}</span></div>
        </div>
        <div className="callout mt-24"><Icon className="callout-icon" name="shield" size={16} /><span>Settings write flow намеренно не добавлен: текущий secure project creation RPC и authorization model остаются неизменными.</span></div>
      </GlassCard>

      <SectionHeader title="Access rules" description="UI следует permissions, но не заменяет server-side authorization и RLS." />
      <GlassCard className="detail-card">
        <div className="detail-list">
          <div className="detail-row"><span className="meta-label">Current role</span><span className="detail-value">{context.role}</span></div>
          <div className="detail-row"><span className="meta-label">Settings write</span><span className="detail-value"><StatusBadge label={context.permissions.includes("settings.write") ? "Granted" : "Not granted"} status={context.permissions.includes("settings.write") ? "connected" : "not_configured"} compact /></span></div>
          <div className="detail-row"><span className="meta-label">Tenant model</span><span className="detail-value">Explicit project membership</span></div>
        </div>
      </GlassCard>

      <SectionHeader title="Danger zone" description="Destructive project actions не добавлены в этот MVP UI." />
      <GlassCard className="detail-card danger-zone">
        <h2 className="section-title">Archive project</h2>
        <p className="section-description">Архивация должна сохранять данные и проходить через отдельный подтверждённый server flow. Здесь пока только визуальный placeholder.</p>
      </GlassCard>
    </div>
  );
}
