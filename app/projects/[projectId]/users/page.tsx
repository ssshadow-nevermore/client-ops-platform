import { notFound, redirect } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { Button, EmptyState, PageHeader, SectionHeader, StatusBadge } from "@/components/ui/primitives";
import { hasProjectPermission } from "@/lib/projects/get-project-context";
import { getProjectMembers, formatProjectDate } from "@/lib/projects/queries";
import { getProjectRequestContext } from "@/lib/projects/get-project-request-context";

type UsersPageProps = { params: Promise<{ projectId: string }> };

export default async function UsersPage({ params }: UsersPageProps) {
  const { projectId } = await params;
  const { context, supabase, user } = await getProjectRequestContext(projectId);

  if (!user) redirect("/login");
  if (!context) notFound();
  if (!hasProjectPermission(context, "users.read")) redirect(`/projects/${projectId}`);

  const members = await getProjectMembers(supabase, projectId);

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={context.project.name}
        title="Users & Access"
        description="Project-level membership, роли и доступы. Изменения membership остаются server-controlled."
        actions={<Button disabled variant="secondary"><Icon name="plus" size={15} /> Invite member</Button>}
      />

      <SectionHeader title="Members" description="Показываем только те membership-данные, которые разрешены текущей permission model." />
      {members.length > 0 ? (
        <div className="member-list">
          {members.map((member) => {
            const isCurrentUser = member.user_id === user.id;
            const displayName = isCurrentUser ? user.email ?? "Current user" : "Project member";
            return (
              <div className="member-row" key={member.id}>
                <span className="member-avatar">{displayName.slice(0, 1).toUpperCase()}</span>
                <div className="member-main"><div className="member-name">{displayName}</div><div className="member-meta">Added {formatProjectDate(member.created_at)}{isCurrentUser ? " · You" : ""}</div></div>
                <StatusBadge label={member.role} status={member.role === "DEVELOPER" ? "connected" : "not_configured"} compact />
                <StatusBadge label={member.status} status={member.status === "active" ? "active" : member.status} compact />
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="users" title="Участников пока нет" description="RLS не вернула membership для этого project context." />
      )}

      <SectionHeader title="Permissions summary" description="Сводка построена из role_permissions, а не из frontend assumptions." />
      <div className="glass-panel detail-card">
        <div className="detail-list">
          {context.permissions.map((permission) => <div className="detail-row" key={permission}><span className="meta-label">Permission</span><span className="detail-value">{permission}</span></div>)}
        </div>
      </div>
    </div>
  );
}
