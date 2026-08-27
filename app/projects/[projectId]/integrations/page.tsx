import { notFound, redirect } from "next/navigation";

import { Icon } from "@/components/ui/icon";
import { Button, GlassCard, PageHeader, SectionHeader, StatusBadge } from "@/components/ui/primitives";
import { getProjectRequestContext } from "@/lib/projects/get-project-request-context";
import { hasProjectPermission } from "@/lib/projects/get-project-context";

type IntegrationsPageProps = { params: Promise<{ projectId: string }> };

const providers = [
  { name: "GitHub", mark: "GH", description: "Repository, branch и latest commit для project context." },
  { name: "Vercel", mark: "V", description: "Production deployments, status и deployment URL." },
  { name: "Supabase", mark: "SB", description: "Connection status и безопасные service health signals." },
  { name: "Sentry", mark: "S", description: "Critical issues, unresolved errors и last event." },
  { name: "PostHog", mark: "PH", description: "Optional analytics provider для будущих product signals." },
];

export default async function IntegrationsPage({ params }: IntegrationsPageProps) {
  const { projectId } = await params;
  const { context, user } = await getProjectRequestContext(projectId);

  if (!user) redirect("/login");
  if (!context) notFound();
  if (!hasProjectPermission(context, "integrations.read")) redirect(`/projects/${projectId}`);

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={context.project.name}
        title="Integrations"
        description="Подключайте внешние provider surfaces, когда они нужны проекту. OAuth и sync flows пока не реализованы."
      />

      <div className="callout"><Icon className="callout-icon" name="shield" size={17} /><span>Сейчас все providers показывают честное `Not connected`. Секреты не хранятся в UI и не отправляются из браузера.</span></div>

      <SectionHeader title="Providers" description="Готовые точки подключения без вымышленных connection states." />
      <div className="integration-grid">
        {providers.map((provider) => (
          <GlassCard className="integration-card" key={provider.name}>
            <div className="integration-card-header"><span className="provider-mark">{provider.mark}</span><StatusBadge label="Not connected" status="not_connected" compact /></div>
            <h2 className="integration-card-title">{provider.name}</h2>
            <p className="integration-card-description">{provider.description}</p>
            <div className="integration-card-footer"><span className="meta-label">Configuration required</span><Button disabled variant="secondary">Connect <Icon name="plug" size={13} /></Button></div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
