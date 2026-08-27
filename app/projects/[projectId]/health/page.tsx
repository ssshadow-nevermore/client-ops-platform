import { notFound, redirect } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { EmptyState, GlassCard, PageHeader, SectionHeader, StatusBadge } from "@/components/ui/primitives";
import { getProjectRequestContext } from "@/lib/projects/get-project-request-context";
import { hasProjectPermission } from "@/lib/projects/get-project-context";

type HealthPageProps = { params: Promise<{ projectId: string }> };

const checks = [
  { title: "HTTP", icon: "globe" as const, message: "No health checks configured", caption: "Website availability will appear after setup." },
  { title: "SSL", icon: "shield" as const, message: "Not configured", caption: "Certificate validity is not being checked yet." },
  { title: "Deployment", icon: "layers" as const, message: "Connect provider", caption: "Deployment status requires a Vercel integration." },
  { title: "Critical Errors", icon: "activity" as const, message: "Connect provider", caption: "Error signals require a Sentry integration." },
  { title: "Integration Freshness", icon: "refresh" as const, message: "Not configured", caption: "Freshness is measured after integrations are connected." },
];

export default async function HealthPage({ params }: HealthPageProps) {
  const { projectId } = await params;
  const { context, user } = await getProjectRequestContext(projectId);

  if (!user) redirect("/login");
  if (!context) notFound();
  if (!hasProjectPermission(context, "health.read")) redirect(`/projects/${projectId}`);

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={context.project.name}
        title="Project Health"
        description="Технические сигналы проекта в одном месте. Пока проверки не настроены, состояние остаётся честно неопределённым."
        actions={<StatusBadge label="Unknown" status="unknown" />}
      />

      <GlassCard className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">Overall health</p>
          <h2 className="dashboard-hero-title">Not configured</h2>
          <p className="dashboard-hero-description">Проект ещё не подключён к Health subsystem. Настройте provider, чтобы получать реальные проверки, а не предположения.</p>
        </div>
        <span className="signal-card-icon"><Icon name="activity" size={19} /></span>
      </GlassCard>

      <SectionHeader title="Checks" description="Каждая карточка отражает реальную готовность конкретного сигнала." />
      <div className="health-grid">
        {checks.map((check) => (
          <GlassCard className="health-card" key={check.title}>
            <div className="health-card-header">
              <div className="health-card-header"><span className="signal-card-icon"><Icon name={check.icon} size={16} /></span><h2 className="health-card-title">{check.title}</h2></div>
              <StatusBadge label={check.message === "Connect provider" ? "Not configured" : "Unknown"} status="unknown" compact />
            </div>
            <p className="health-card-message">{check.message}</p>
            <p className="health-card-caption">{check.caption}</p>
          </GlassCard>
        ))}
      </div>

      <SectionHeader title="Open incidents" description="Incident history появится после первого запуска проверок." />
      <EmptyState icon="shield" title="Инцидентов пока нет" description="Невозможно подтвердить отсутствие проблем до настройки health checks. Здесь будут отображаться только реальные incidents." />
    </div>
  );
}
