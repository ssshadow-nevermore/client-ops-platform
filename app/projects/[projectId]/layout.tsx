import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { getProjectRequestContext } from "@/lib/projects/get-project-request-context";

type ProjectLayoutProps = {
  children: ReactNode;
  params: Promise<unknown>;
};

export default async function ProjectLayout({ children, params }: ProjectLayoutProps) {
  const { projectId } = (await params) as { projectId: string };
  const { context, user } = await getProjectRequestContext(projectId);

  if (!user) {
    redirect("/login");
  }

  if (!context) {
    notFound();
  }

  return (
    <AppShell
      organizationName={context.organizationName}
      permissions={context.permissions}
      projectId={context.project.id}
      projectName={context.project.name}
      projectRole={context.role}
      projectSlug={context.project.slug}
      userEmail={user.email}
    >
      {children}
    </AppShell>
  );
}
