import { notFound, redirect } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { EmptyState, PageHeader, SectionHeader, StatusBadge } from "@/components/ui/primitives";
import { hasProjectPermission } from "@/lib/projects/get-project-context";
import { formatProjectDateTime, getProjectAuditEvents } from "@/lib/projects/queries";
import { getProjectRequestContext } from "@/lib/projects/get-project-request-context";

type AuditPageProps = { params: Promise<{ projectId: string }> };

export default async function AuditPage({ params }: AuditPageProps) {
  const { projectId } = await params;
  const { context, supabase, user } = await getProjectRequestContext(projectId);

  if (!user) redirect("/login");
  if (!context) notFound();
  if (!hasProjectPermission(context, "audit.read")) redirect(`/projects/${projectId}`);

  const events = await getProjectAuditEvents(supabase, projectId);

  return (
    <div className="page-container">
      <PageHeader eyebrow={context.project.name} title="Audit log" description="Append-only история действий проекта: actor, action, entity, результат и безопасные metadata." />

      <div className="filter-bar">
        <div className="filter-item"><span className="meta-label">Actor</span><span className="filter-value">All actors</span></div>
        <div className="filter-item"><span className="meta-label">Action</span><span className="filter-value">All actions</span></div>
        <div className="filter-item"><span className="meta-label">Date</span><span className="filter-value">Any time</span></div>
        <span className="filter-note">Filters UI · coming with audit query controls</span>
      </div>

      <SectionHeader title="Timeline" description={`${events.length} events loaded through the existing RLS-protected Audit Core.`} />
      {events.length > 0 ? (
        <div className="audit-list">
          {events.map((event) => {
            const actor = event.user_id === user.id ? user.email ?? "You" : "Project member";
            return (
              <div className="audit-row" key={event.id}>
                <span className="audit-mark"><Icon name="history" size={15} /></span>
                <div className="audit-main"><div className="audit-action">{event.action}</div><div className="audit-entity">{event.entity_type}{event.entity_id ? ` · ${event.entity_id}` : ""} · {actor}</div><div className="audit-time">{formatProjectDateTime(event.created_at)}</div></div>
                <StatusBadge label={event.result} status={event.result === "success" ? "success" : event.result === "denied" ? "warning" : "failed"} compact />
                <details className="audit-meta-details"><summary>metadata</summary><pre>{JSON.stringify(event.metadata ?? {}, null, 2)}</pre></details>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="layers" title="Audit events ещё не записаны" description="Audit Core уже подключён к security-sensitive flows. Здесь появятся события по мере работы с проектом." />
      )}
    </div>
  );
}
