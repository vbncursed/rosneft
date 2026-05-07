"use client";

import { useConversionWatcher } from "@/conversion/application/use-conversion-watcher";

interface ConversionPendingProps {
  title: string;
  slug: string;
  // jobId is provided when the user just created the entity in this
  // session — we can subscribe to SSE for live progress. When absent
  // (e.g. revisiting a territory whose conversion was queued by the
  // background reconciler), the watcher falls back to polling.
  jobId?: string | null;
}

const STATUS_COPY: Record<string, string> = {
  polling: "Ожидание начала конвертации…",
  pending: "Задача в очереди.",
  running: "Идёт конвертация модели.",
  succeeded: "Готово, обновляем страницу…",
  failed: "Конвертация завершилась с ошибкой.",
  unavailable: "Не удалось подписаться на статус задачи.",
};

export default function ConversionPending({
  title,
  slug,
  jobId = null,
}: ConversionPendingProps) {
  const { status, error } = useConversionWatcher(jobId);
  const message = STATUS_COPY[status] ?? STATUS_COPY.running;
  const failed = status === "failed" || status === "unavailable";

  return (
    <main className="relative flex h-screen w-screen items-center justify-center bg-black px-6 text-center text-neutral-300">
      <div className="max-w-xl space-y-4">
        <p className="text-xs uppercase tracking-[0.36em] text-cyan-300/80">
          {title}
        </p>
        <h1 className="text-2xl font-semibold text-white">
          {failed ? "Конвертация не удалась" : "Идёт конвертация модели"}
        </h1>
        <p className="text-sm leading-6">
          {message}
          {!failed && (
            <>
              {" "}
              mesh-worker обрабатывает{" "}
              <code className="rounded bg-white/10 px-2 py-1 text-cyan-200">
                {slug}
              </code>
              .
            </>
          )}
        </p>
        {error ? (
          <p className="rounded-md border border-red-300/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        ) : null}
        {!failed ? (
          <div className="mx-auto h-1 w-48 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/2 animate-pulse bg-cyan-300/60" />
          </div>
        ) : null}
      </div>
    </main>
  );
}
