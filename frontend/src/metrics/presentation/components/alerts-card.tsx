"use client";

import { usePanelSeries } from "@/metrics/application/use-panel-series";
import type { Range } from "@/metrics/domain/panel";

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
          {series.map((s) => (
            <li
              key={s.label}
              className="flex items-center justify-between rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100"
            >
              <span>{s.label}</span>
              <span className="text-[10px] uppercase tracking-[0.28em] text-amber-200/70">
                active
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
