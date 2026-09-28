"use client";

import { useEffect, useRef } from "react";
import * as Sentry from "@sentry/nextjs";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const reportedError = useRef<Error | null>(null);

  useEffect(() => {
    // Server errors are already reported by onRequestError.
    if (!error.digest && reportedError.current !== error) {
      reportedError.current = error;
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Что-то пошло не так</h1>
      <p>Попробуйте ещё раз. Если ошибка повторится, мы проверим её.</p>
      <button type="button" onClick={retry} className="rounded-lg border px-4 py-2">
        Повторить
      </button>
    </main>
  );
}
