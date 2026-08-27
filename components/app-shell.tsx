import Link from "next/link";
import type { ReactNode } from "react";

import { logout } from "@/app/dashboard/actions";

import { NavLink } from "./nav-link";
import { Icon, type IconName } from "./ui/icon";
import { cn } from "./ui/primitives";

const projectNavigation: Array<{
  key: string;
  label: string;
  icon: IconName;
  permission?: string;
}> = [
  { key: "overview", label: "Overview", icon: "grid" },
  { key: "health", label: "Health", icon: "activity", permission: "health.read" },
  { key: "content", label: "Content", icon: "file", permission: "content.read" },
  { key: "integrations", label: "Integrations", icon: "plug", permission: "integrations.read" },
  { key: "users", label: "Users", icon: "users", permission: "users.read" },
  { key: "audit", label: "Audit", icon: "layers", permission: "audit.read" },
  { key: "settings", label: "Settings", icon: "settings", permission: "settings.read" },
];

type AppShellProps = {
  children: ReactNode;
  organizationName?: string;
  projectId?: string;
  projectName?: string;
  projectSlug?: string;
  projectRole?: string;
  permissions?: string[];
  userEmail?: string;
};

export function AppShell({
  children,
  organizationName = "Client Ops Platform",
  projectId,
  projectName,
  projectSlug,
  projectRole,
  permissions = [],
  userEmail,
}: AppShellProps) {
  const projectItems = projectId
    ? projectNavigation.filter(
        (item) =>
          (item.key !== "overview" || projectRole !== "CLIENT") &&
          (!item.permission || permissions.includes(item.permission)),
      )
    : [];

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-top">
          <Link className="brand" href="/dashboard">
            <span className="brand-mark"><Icon name="sparkles" size={17} /></span>
            <span className="brand-copy">
              <span className="brand-name">Client Ops</span>
              <span className="brand-caption">Control plane</span>
            </span>
          </Link>

          <div className="workspace-context">
            <span className="workspace-avatar">{organizationName.slice(0, 1).toUpperCase()}</span>
            <span className="workspace-copy">
              <span className="workspace-label">Workspace</span>
              <span className="workspace-name">{organizationName}</span>
            </span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <p className="nav-group-label">Workspace</p>
          <NavLink end href="/dashboard" icon="grid" label="Dashboard" />

          {projectId && (
            <>
              <p className="nav-group-label nav-group-label-project">Project</p>
              <div className="project-context-card">
                <span className="project-context-icon"><Icon name="layers" size={16} /></span>
                <span className="project-context-copy">
                  <span className="project-context-name">{projectName}</span>
                  <span className="project-context-slug">/{projectSlug}</span>
                </span>
              </div>
              {projectItems.map((item) => (
                <NavLink
                  key={item.key}
                  end={item.key === "overview"}
                  href={`/projects/${projectId}${item.key === "overview" ? "" : `/${item.key}`}`}
                  icon={item.icon}
                  label={item.label}
                />
              ))}
            </>
          )}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <Icon name="users" size={14} />
            <span>Authenticated workspace</span>
          </div>
          <div className="user-card">
            <span className="user-avatar">{(userEmail ?? "U").slice(0, 1).toUpperCase()}</span>
            <span className="user-copy">
              <span className="user-email">{userEmail ?? "Signed in"}</span>
              <span className="user-role">{projectRole ?? "Workspace member"}</span>
            </span>
            <form action={logout}>
              <button aria-label="Выйти" className="logout-button" title="Выйти" type="submit">
                <Icon name="arrow-up-right" size={15} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-context">
            <span className="topbar-kicker">{projectId ? "Project workspace" : "Workspace overview"}</span>
            <span className="topbar-title">{projectName ?? organizationName}</span>
          </div>
          <div className="topbar-actions">
            {projectId && <span className="topbar-role">{projectRole ?? "Member"}</span>}
            <span className="topbar-secure"><Icon name="clock" size={14} /> Authenticated session</span>
          </div>
        </header>

        {projectId && (
          <details className="mobile-nav">
            <summary><Icon name="menu" size={17} /> Project navigation</summary>
            <div className="mobile-nav-panel">
              {projectItems.map((item) => (
                <NavLink
                  key={item.key}
                  end={item.key === "overview"}
                  href={`/projects/${projectId}${item.key === "overview" ? "" : `/${item.key}`}`}
                  icon={item.icon}
                  label={item.label}
                  mobile
                />
              ))}
            </div>
          </details>
        )}

        <main className={cn("app-content", projectId ? "app-content-project" : undefined)}>
          {children}
        </main>
      </div>
    </div>
  );
}
