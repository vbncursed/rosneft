"use client";

import { useConversionWatcher } from "@/conversion/application/use-conversion-watcher";

interface ConversionPendingProps {
  title: string;
  slug: string;
}

const STATUS_COPY: Record<string, string> = {
  submitting: "Постановка задачи в очередь…",
  pending: "Задача в очереди.",
  running: "Идёт конвертация модели.",
  succeeded: "Готово, обновляем страницу…",
  failed: "Конвертация завершилась с ошибкой.",
  unavailable: "Не удалось подписаться на статус задачи.",
};

// ConversionPending is shown when the catalog has a project but mesh-worker
// has not yet produced a LOD0 artifact. The watcher posts /convert on
// mount, subscribes to the SSE event stream for the resulting job id, and
// triggers a router.refresh() the moment the job reports succeeded.
export default function ConversionPending({
  title,
  slug,
}: ConversionPendingProps) {
  const { status, error } = useConversionWatcher(slug);
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
