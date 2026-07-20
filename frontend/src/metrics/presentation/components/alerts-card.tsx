"use client";

import { usePanelSeries } from "@/metrics/application/use-panel-series";
import type { Range } from "@/metrics/domain/panel";
import type { Series } from "@/metrics/domain/series";

// firing — условие держится дольше, чем `for` у правила. pending — держится,
// но ещё не подтвердилось; для восьми наших правил это первая минута-две.
const TONE = {
  firing: "border-red-300/40 bg-red-500/15 text-red-200",
  pending: "border-amber-300/30 bg-amber-400/10 text-amber-100",
} as const;

function stateOf(s: Series): keyof typeof TONE {
  return s.labels?.alertstate === "firing" ? "firing" : "pending";
}

/** По кому сработало: сервис, иначе конкретный таргет. */
function targetOf(s: Series): string | undefined {
  const l = s.labels;
  return l?.service ?? l?.grpc_service ?? l?.instance;
}

export default function AlertsCard({ range }: { range: Range }) {
  const { series, error, loading } = usePanelSeries("alerts", range);

  return (
    <section className="rounded-xl border border-white/10 bg-black/30 p-4">
      <h3 className="mb-3 text-[10px] uppercase tracking-[0.28em] text-neutral-400">Alerts</h3>
      {error ? (
        <p className="rounded-lg border border-red-300/40 bg-red-500/15 px-3 py-4 text-sm text-red-200">
          Could not load alert state
        </p>
      ) : loading ? (
        <div className="h-16 animate-pulse rounded-lg bg-white/5" />
      ) : series.length === 0 ? (
        <p className="py-4 text-sm text-neutral-400">All clear. No active alerts.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {series.map((s) => {
            const state = stateOf(s);
            const target = targetOf(s);
            const severity = s.labels?.severity;
            return (
              // Один алерт может гореть по нескольким сервисам сразу, поэтому
              // ключ — имя плюс цель, а не одно имя.
              <li
                key={`${s.label}:${target ?? ""}`}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${TONE[state]}`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{s.label}</span>
                  {(target || severity) && (
                    <span className="truncate text-xs opacity-70">
                      {[target, severity].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-[0.28em] opacity-70">
                  {state}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
