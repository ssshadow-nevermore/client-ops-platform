import Link from "next/link";
import type { ReactNode } from "react";

import { Icon, type IconName } from "./icon";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type GlassCardProps = {
  children: ReactNode;
  className?: string;
  href?: string;
  interactive?: boolean;
};

export function GlassCard({
  children,
  className,
  href,
  interactive = false,
}: GlassCardProps) {
  const cardClassName = cn(
    "glass-panel",
    interactive || href ? "glass-panel-interactive" : undefined,
    className,
  );

  if (href) {
    return (
      <Link className={cardClassName} href={href}>
        {children}
      </Link>
    );
  }

  return <div className={cardClassName}>{children}</div>;
}

const statusLabels: Record<string, string> = {
  active: "Active",
  connected: "Connected",
  critical: "Critical",
  disabled: "Disabled",
  failed: "Failed",
  healthy: "Healthy",
  invited: "Invited",
  maintenance: "Maintenance",
  not_configured: "Not configured",
  not_connected: "Not connected",
  pending: "Pending",
  published: "Published",
  success: "Success",
  unknown: "Unknown",
  warning: "Warning",
};

export function StatusBadge({
  status,
  label,
  compact = false,
}: {
  status: string;
  label?: string;
  compact?: boolean;
}) {
  const normalizedStatus = status.replaceAll("-", "_");

  return (
    <span
      className={cn(
        "status-badge",
        `status-${normalizedStatus}`,
        compact ? "status-badge-compact" : undefined,
      )}
    >
      <span className="status-badge-dot" />
      {label ?? statusLabels[normalizedStatus] ?? status}
    </span>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-description">{description}</p>}
        {children}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        <h2 className="section-title">{title}</h2>
        {description && <p className="section-description">{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon = "sparkles",
  title,
  description,
  action,
  className,
}: {
  icon?: IconName;
  title: ReactNode;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("empty-state", className)}>
      <div className="empty-state-icon">
        <Icon name={icon} size={21} />
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-description">{description}</p>
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon,
  tone = "default",
}: {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  icon: IconName;
  tone?: "default" | "accent" | "quiet";
}) {
  return (
    <GlassCard className={cn("stat-card", `stat-card-${tone}`)}>
      <div className="stat-card-topline">
        <span className="stat-card-label">{label}</span>
        <span className="stat-card-icon">
          <Icon name={icon} size={17} />
        </span>
      </div>
      <p className="stat-card-value">{value}</p>
      {detail && <p className="stat-card-detail">{detail}</p>}
    </GlassCard>
  );
}

export function FormField({
  id,
  label,
  hint,
  required = false,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="form-field">
      <label className="form-label" htmlFor={id}>
        {label}
        {required && <span className="form-required">*</span>}
      </label>
      {children}
      {hint && <p className="form-hint">{hint}</p>}
    </div>
  );
}

export function ButtonLink({
  children,
  href,
  variant = "primary",
  className,
}: {
  children: ReactNode;
  href: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  return (
    <Link className={cn("button", `button-${variant}`, className)} href={href}>
      {children}
    </Link>
  );
}

export function Button({
  children,
  type = "button",
  variant = "primary",
  className,
  disabled = false,
}: {
  children: ReactNode;
  type?: "button" | "submit" | "reset";
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button className={cn("button", `button-${variant}`, className)} disabled={disabled} type={type}>
      {children}
    </button>
  );
}
