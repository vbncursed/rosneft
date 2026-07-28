"use client";

import { lazy, Suspense } from "react";
import { usePanelSeries } from "@/metrics/application/use-panel-series";
import type { PanelView, Range } from "@/metrics/domain/panel";

// Recharts весит около 450 КБ — грузим его только на этой owner-only странице
// (React.lazy + Suspense), а не в общий бандл сайта.
const TimeSeriesChart = lazy(() => import("../charts/time-series-chart"));

export default function PanelCard({ panel, range }: { panel: PanelView; range: Range }) {
  const { series, error, loading } = usePanelSeries(panel.id, range);
  return (
    <section className="rounded-xl border border-white/10 bg-black/30 p-4">
      <h3 className="mb-3 text-[10px] uppercase tracking-[0.28em] text-neutral-400">
        {panel.title}
      </h3>
      {error ? (
        <p className="rounded-lg border border-red-300/40 bg-red-500/15 px-3 py-6 text-center text-sm text-red-200">
          Metric unavailable
        </p>
      ) : loading ? (
        <div className="h-56 animate-pulse rounded-lg bg-white/5" />
      ) : series.length === 0 ? (
        <p className="flex h-56 items-center justify-center text-sm text-neutral-500">No data</p>
      ) : (
        <Suspense fallback={<div className="h-56 animate-pulse rounded-lg bg-white/5" />}>
          <TimeSeriesChart series={series} unit={panel.unit} />
        </Suspense>
      )}
    </section>
  );
}
