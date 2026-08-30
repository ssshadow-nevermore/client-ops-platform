export const HEALTH_CHECK_COOLDOWN_SECONDS = 30;

export function getHealthCheckCooldownRetryAfterSeconds(
  lastCheckedAt: string | null,
  now = new Date(),
  cooldownSeconds = HEALTH_CHECK_COOLDOWN_SECONDS,
): number | null {
  if (!lastCheckedAt) {
    return null;
  }

  const lastCheckedAtMs = Date.parse(lastCheckedAt);

  if (!Number.isFinite(lastCheckedAtMs)) {
    return null;
  }

  const remainingMs = cooldownSeconds * 1000 -
    (now.getTime() - lastCheckedAtMs);

  if (remainingMs <= 0) {
    return null;
  }

  return Math.max(1, Math.ceil(remainingMs / 1000));
}
