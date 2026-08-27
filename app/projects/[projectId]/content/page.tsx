import { notFound, redirect } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/primitives";
import { getProjectRequestContext } from "@/lib/projects/get-project-request-context";
import { hasProjectPermission } from "@/lib/projects/get-project-context";

type ContentPageProps = { params: Promise<{ projectId: string }> };

export default async function ContentPage({ params }: ContentPageProps) {
  const { projectId } = await params;
  const { context, user } = await getProjectRequestContext(projectId);

  if (!user) redirect("/login");
  if (!context) notFound();
  if (!hasProjectPermission(context, "content.read")) redirect(`/projects/${projectId}`);

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={context.project.name}
        title="Content"
        description="Будущий CMS workspace: модули слева, записи в центре, редактор и media context справа."
        actions={<StatusBadge label="CMS not configured" status="not_configured" />}
      />

      <div className="content-workspace">
        <section className="content-pane">
          <p className="content-pane-title">Modules</p>
          <p className="content-pane-caption">Типы контента проекта</p>
          <div className="module-list">
            <div className="module-item module-item-muted"><span className="module-item-dot" /> No modules yet</div>
            <div className="module-item"><Icon name="plus" size={13} /> Module setup pending</div>
          </div>
        </section>

        <section className="content-pane">
          <p className="content-pane-title">Entries</p>
          <p className="content-pane-caption">Записи выбранного модуля</p>
          <div className="editor-placeholder">
            <span className="placeholder-icon"><Icon name="file" size={19} /></span>
            <h2 className="placeholder-title">Нет выбранного модуля</h2>
            <p className="placeholder-text">После настройки ContentModule здесь появятся записи, статусы draft/published и действия редактирования.</p>
          </div>
        </section>

        <section className="content-pane content-pane-muted">
          <p className="content-pane-title">Editor & media</p>
          <p className="content-pane-caption">Контекст записи</p>
          <div className="media-placeholder">
            <span className="placeholder-icon"><Icon name="layers" size={19} /></span>
            <h2 className="placeholder-title">Editor ready for schema</h2>
            <p className="placeholder-text">Поля будут строиться из ContentFields. Media uploads подключаются отдельным безопасным модулем.</p>
          </div>
        </section>
      </div>

      <div className="mt-24">
        <EmptyState icon="file" title="Контентные модули ещё не созданы" description="UI уже подготовлен под generic ContentModule и ContentEntry. Schema builder и CMS backend не добавлялись ради визуального каркаса." />
      </div>
    </div>
  );
}
