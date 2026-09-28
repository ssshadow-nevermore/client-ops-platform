"use client";

import { useEffect, useRef } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const reportedError = useRef<Error | null>(null);

  useEffect(() => {
    if (!error.digest && reportedError.current !== error) {
      reportedError.current = error;
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <html lang="ru">
      <body>
        <main style={{ maxWidth: 480, margin: "15vh auto", padding: 24, textAlign: "center" }}>
          <h1>Что-то пошло не так</h1>
          <p>Попробуйте ещё раз. Если ошибка повторится, мы проверим её.</p>
          <button type="button" onClick={retry}>
            Повторить
          </button>
        </main>
      </body>
    </html>
  );
}
