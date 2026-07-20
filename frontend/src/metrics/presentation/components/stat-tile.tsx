"use client";

import { usePanelSeries } from "@/metrics/application/use-panel-series";
import type { Range } from "@/metrics/domain/panel";
import { formatValue } from "@/metrics/domain/series";
import type { PanelView } from "./panel-card";

export default function StatTile({ panel, range }: { panel: PanelView; range: Range }) {
  const { series, error, loading } = usePanelSeries(panel.id, range);
  const last = series[0]?.points.at(-1)?.v;

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.28em] text-neutral-400">{panel.title}</p>
      <p
        className={`mt-1 font-mono text-2xl ${error ? "text-red-200" : "text-cyan-300"}`}
        aria-busy={loading}
      >
        {error ? "—" : loading || last === undefined ? "…" : formatValue(last, panel.unit)}
      </p>
    </div>
  );
}
