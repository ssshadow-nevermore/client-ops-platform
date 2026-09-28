import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import {
  EmptyState,
  GlassCard,
  PageHeader,
  SectionHeader,
  StatusBadge,
} from "@/components/ui/primitives";
import { getProjectRequestContext } from "@/lib/projects/get-project-request-context";
import {
  formatHealthTimestamp,
  getCriticalErrorsHealthPresentation,
  getDeploymentHealthPresentation,
  getHealthStatusLabel,
  getProjectHealth,
  getSslHealthDetails,
  type HealthStatus,
} from "@/lib/projects/health";
import { hasProjectPermission } from "@/lib/projects/get-project-context";

import { HealthCheckAction } from "./health-check-action";

type HealthPageProps = { params: Promise<{ projectId: string }> };

function HealthSignalCard({
  caption,
  children,
  icon,
  status,
  title,
}: {
  caption: string;
  children: ReactNode;
  icon: IconName;
  status: HealthStatus;
  title: string;
}) {
  return (
    <GlassCard className="health-card">
      <div className="health-card-header">
        <div className="health-card-heading">
          <span className="signal-card-icon">
            <Icon name={icon} size={16} />
          </span>
          <h2 className="health-card-title">{title}</h2>
        </div>
        <StatusBadge
          compact
          label={getHealthStatusLabel(status)}
          status={status}
        />
      </div>
      <div className="health-card-details">{children}</div>
      <p className="health-card-caption">{caption}</p>
    </GlassCard>
  );
}

export default async function HealthPage({ params }: HealthPageProps) {
  const { projectId } = await params;
  const { context, supabase, user } = await getProjectRequestContext(projectId);

  if (!user) redirect("/login");
  if (!context) notFound();
  if (!hasProjectPermission(context, "health.read")) {
    redirect(`/projects/${projectId}`);
  }

  const project = context.project;
  const health = await getProjectHealth(supabase, projectId);
  const canCheck = Boolean(
    health && project.status === "active" && project.production_url,
  );
  const unavailableReason = !health
    ? "health"
    : !project.production_url
    ? "production_url"
    : project.status !== "active"
    ? "inactive"
    : undefined;
  const lastCheckedLabel = formatHealthTimestamp(health?.last_checked_at);
  const sslDetails = health
    ? getSslHealthDetails(health.ssl_status, health.ssl_expires_at)
    : null;
  const deploymentDetails = health
    ? getDeploymentHealthPresentation(health.deployment_status, health.details)
    : null;
  const criticalErrorsDetails = health
    ? getCriticalErrorsHealthPresentation(
      health.critical_errors_status,
      health.critical_error_count,
      health.details,
    )
    : null;

  return (
    <div className="page-container">
      <PageHeader
        eyebrow={project.name}
        title="Project Health"
        description="Канонический health snapshot проекта. Overall status читается из project_health и учитывает HTTP, SSL и будущие сигналы."
        actions={
          <HealthCheckAction
            canCheck={canCheck}
            projectId={projectId}
            settingsHref={`/projects/${projectId}/settings`}
            unavailableReason={unavailableReason}
          />
        }
      />

      {health ? (
        <GlassCard className="dashboard-hero health-overall-card">
          <div className="dashboard-hero-copy">
            <p className="eyebrow">Overall health</p>
            <div className="health-overall-line">
              <h2 className="dashboard-hero-title">
                {getHealthStatusLabel(health.overall_status)}
              </h2>
              <StatusBadge
                label={getHealthStatusLabel(health.overall_status)}
                status={health.overall_status}
              />
            </div>
            <p className="dashboard-hero-description">
              {lastCheckedLabel
                ? `Last checked ${lastCheckedLabel}. `
                : "Health check ещё не выполнялся. "}
              Overall status учитывает все сохранённые Health signals.
            </p>
          </div>
          <div className="health-overall-meta">
            <span className="signal-card-icon">
              <Icon name="activity" size={19} />
            </span>
            <span className="health-overall-meta-label">project_health</span>
          </div>
        </GlassCard>
      ) : (
        <EmptyState
          icon="activity"
          title="Health snapshot unavailable"
          description="Для этого project context не удалось прочитать canonical project_health row. Новые health-значения не подставляются."
        />
      )}

      {health && (
        <>
          <SectionHeader
            title="Checks"
            description="Значения ниже отображают только поля, сохранённые в project_health."
          />
          <div className="health-grid">
            <HealthSignalCard
              caption="HTTP snapshot from the latest controlled check."
              icon="globe"
              status={health.http_status}
              title="HTTP"
            >
              <div className="health-detail-row">
                {health.http_status_code !== null && (
                  <strong>HTTP {health.http_status_code}</strong>
                )}
                {health.http_response_time_ms !== null && (
                  <span>{health.http_response_time_ms} ms</span>
                )}
              </div>
              <div className="health-detail-muted">
                {lastCheckedLabel
                  ? `Last checked ${lastCheckedLabel}`
                  : "Not checked yet"}
              </div>
            </HealthSignalCard>

            <HealthSignalCard
              caption="SSL certificate snapshot from the final URL after the controlled HTTP check."
              icon="shield"
              status={health.ssl_status}
              title="SSL"
            >
              <div className="health-detail-row">
                {sslDetails?.expiresLabel && (
                  <span>Expires {sslDetails.expiresLabel}</span>
                )}
                <span>{sslDetails?.message}</span>
              </div>
            </HealthSignalCard>

            <HealthSignalCard
              caption="Deployment signal is populated by the deployment provider integration."
              icon="layers"
              status={health.deployment_status}
              title="Deployment"
            >
              {deploymentDetails ? (
                <>
                  <div className="health-detail-row">
                    <strong>
                      {deploymentDetails.providerLabel} · {deploymentDetails.stateLabel}
                    </strong>
                  </div>
                  <div className="health-detail-muted">
                    Deployed {deploymentDetails.createdAtLabel}
                  </div>
                </>
              ) : (
                <div className="health-detail-row">
                  {health.deployment_status === "not_configured"
                    ? "Not configured"
                    : "Provider status not recorded"}
                </div>
              )}
            </HealthSignalCard>

            <HealthSignalCard
              caption="Error signal is populated by the monitoring provider integration."
              icon="activity"
              status={health.critical_errors_status}
              title="Critical Errors"
            >
              {criticalErrorsDetails ? (
                <>
                  <div className="health-detail-row">
                    <strong>{criticalErrorsDetails.summary}</strong>
                  </div>
                  <div className="health-detail-muted">
                    {criticalErrorsDetails.detail}
                  </div>
                </>
              ) : (
                <div className="health-detail-row">
                  {health.critical_errors_status === "not_configured"
                    ? "Not configured"
                    : "Error count not recorded"}
                </div>
              )}
            </HealthSignalCard>

            <HealthSignalCard
              caption="Freshness is measured after provider integrations are connected."
              icon="refresh"
              status={health.integration_freshness_status}
              title="Integration Freshness"
            >
              <div className="health-detail-row">
                Freshness value not recorded
              </div>
            </HealthSignalCard>
          </div>

          <SectionHeader
            title="Open incidents"
            description="Incident history появится после реализации health incident storage."
          />
          <EmptyState
            icon="shield"
            title="Incidents not available yet"
            description="Этот MVP пока показывает canonical project_health snapshot; отдельный incident backend ещё не подключён."
          />
        </>
      )}
    </div>
  );
}
