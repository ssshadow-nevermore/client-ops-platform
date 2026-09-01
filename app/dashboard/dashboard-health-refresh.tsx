"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { runProjectHealthCheck } from "@/app/projects/[projectId]/health/actions";

type DashboardHealthRefreshProps = {
  projectIds: string[];
};

export function DashboardHealthRefresh({
  projectIds,
}: DashboardHealthRefreshProps) {
  const router = useRouter();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current || projectIds.length === 0) {
      return;
    }

    startedRef.current = true;
    let isMounted = true;

    void Promise.allSettled(
      projectIds.map((projectId) => runProjectHealthCheck(projectId)),
    ).then(() => {
      if (isMounted) {
        router.refresh();
      }
    });

    return () => {
      isMounted = false;
    };
  }, [projectIds, router]);

  return null;
}
