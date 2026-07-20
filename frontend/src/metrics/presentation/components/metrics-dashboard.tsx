"use client";

import { useState } from "react";
import type { Range } from "@/metrics/domain/panel";
import AlertsCard from "./alerts-card";
import PanelCard, { type PanelView } from "./panel-card";
import RangePicker from "./range-picker";
import StatTile from "./stat-tile";

export type Section = { title: string; panels: PanelView[] };

export default function MetricsDashboard({
  stats,
  sections,
}: {
  stats: PanelView[];
  sections: Section[];
}) {
  const [range, setRange] = useState<Range>("6h");

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Metrics</h1>
          <p className="mt-1 text-xs text-neutral-400">Refreshes every 30 seconds</p>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((p) => (
          <StatTile key={p.id} panel={p} range={range} />
        ))}
      </div>

      <AlertsCard range={range} />

      {sections.map((s) => (
        <section key={s.title} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-white/70">{s.title}</h2>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {s.panels.map((p) => (
              <PanelCard key={p.id} panel={p} range={range} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
