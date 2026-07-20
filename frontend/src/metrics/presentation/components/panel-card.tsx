"use client";

import dynamic from "next/dynamic";
import { usePanelSeries } from "@/metrics/application/use-panel-series";
import type { PanelDef, Range } from "@/metrics/domain/panel";

// Recharts весит около 450 КБ — грузим его только на этой owner-only странице,
// а не в общий бандл сайта.
const TimeSeriesChart = dynamic(() => import("../charts/time-series-chart"), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-lg bg-white/5" />,
});

export type PanelView = Pick<PanelDef, "id" | "title" | "unit">;

export default function PanelCard({ panel, range }: { panel: PanelView; range: Range }) {
  const { series, error, loading } = usePanelSeries(panel.id, range);
  return (
    <section className="rounded-xl border border-white/10 bg-black/30 p-4">
      <h3 className="mb-3 text-[10px] uppercase tracking-[0.28em] text-neutral-400">
        {panel.title}
      </h3>
      {error ? (
        <p className="rounded-lg border border-red-300/40 bg-red-500/15 px-3 py-6 text-center text-sm text-red-200">
          Метрика недоступна
        </p>
      ) : loading ? (
        <div className="h-56 animate-pulse rounded-lg bg-white/5" />
      ) : series.length === 0 ? (
        <p className="flex h-56 items-center justify-center text-sm text-neutral-500">Нет данных</p>
      ) : (
        <TimeSeriesChart series={series} unit={panel.unit} />
      )}
    </section>
  );
}
