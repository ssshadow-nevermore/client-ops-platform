"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { ButtonLink } from "@/components/ui/primitives";

import {
  runProjectHealthCheck,
  type HealthCheckActionResult,
} from "./actions";
import { shouldRefreshHealthSnapshot } from "@/lib/projects/health-check-action";

type HealthCheckActionProps = {
  canCheck: boolean;
  projectId: string;
  settingsHref: string;
  unavailableReason?: "health" | "inactive" | "production_url";
};

const unavailableMessages = {
  health: "Health snapshot недоступен для этого project context.",
  inactive: "Проверка доступна только для active project.",
  production_url:
    "Добавьте production URL в Project Settings, чтобы включить проверку.",
} as const;

export function HealthCheckAction({
  canCheck,
  projectId,
  settingsHref,
  unavailableReason,
}: HealthCheckActionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<HealthCheckActionResult | null>(null);

  function handleCheck() {
    setResult(null);

    startTransition(async () => {
      const nextResult = await runProjectHealthCheck(projectId);
      setResult(nextResult);

      if (shouldRefreshHealthSnapshot(nextResult)) {
        router.refresh();
      }
    });
  }

  return (
    <div className="health-action" aria-live="polite">
      <div className="health-action-controls">
        <button
          aria-busy={isPending}
          className="button button-secondary"
          disabled={!canCheck || isPending}
          onClick={handleCheck}
          type="button"
        >
          <Icon className={isPending ? "health-action-spinner" : undefined} name="refresh" size={15} />
          {isPending ? "Checking…" : "Check now"}
        </button>
        {unavailableReason === "production_url" && (
          <ButtonLink href={settingsHref} variant="ghost">
            Project settings
          </ButtonLink>
        )}
      </div>

      {unavailableReason && (
        <p className="health-action-hint">
          {unavailableMessages[unavailableReason]}
        </p>
      )}

      {result && !result.ok && (
        <>
          <p className="health-action-result health-action-result-error" role="alert">
            {result.message}
          </p>
          {result.snapshotUpdated && (
            <p className="health-action-result health-action-result-success">
              Health snapshot updated with this result.
            </p>
          )}
        </>
      )}

      {result?.ok && (
        <p className="health-action-result health-action-result-success">
          Health snapshot updated.
        </p>
      )}
    </div>
  );
}
