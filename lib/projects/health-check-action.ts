const persistedHealthFailureCodes = new Set([
  "network_error",
  "timeout",
  "invalid_redirect",
  "redirect_limit",
]);

export function isPersistedHealthFailure(code: string): boolean {
  return persistedHealthFailureCodes.has(code);
}

export function shouldRefreshHealthSnapshot(result: {
  ok: boolean;
  snapshotUpdated: boolean;
}): boolean {
  return result.ok || result.snapshotUpdated;
}

export function getHealthCheckErrorMessage(
  code: string,
  status: number,
  retryAfterSeconds?: number,
): string {
  switch (code) {
    case "function_unreachable":
      return "Health service временно недоступен. Состояние проекта не изменено.";
    case "network_error":
      return "Production URL не отвечает на сетевой запрос.";
    case "timeout":
      return "Проверка Production URL не завершилась вовремя. Повторите попытку позже.";
    case "invalid_redirect":
      return "Redirect Production URL не прошёл проверку безопасности.";
    case "redirect_limit":
      return "Production URL превысил допустимое число redirect-переходов.";
    case "check_cooldown":
      return retryAfterSeconds
        ? `Проверка уже выполнялась. Повторите через ${retryAfterSeconds} сек.`
        : "Проверка уже выполнялась. Повторите попытку немного позже.";
    default:
      break;
  }

  switch (status) {
    case 400:
      return "Production URL не прошёл проверку безопасности.";
    case 401:
      return "Сессия истекла. Войдите снова и повторите проверку.";
    case 404:
      return "Project недоступен или Health permission не выдан.";
    case 409:
      return "Project должен быть active и иметь production URL.";
    case 502:
    case 504:
      return "Health service временно недоступен. Состояние проекта не изменено.";
    case 500:
      return "Не удалось сохранить результат Health check.";
    default:
      return "Health check не удалось выполнить.";
  }
}
