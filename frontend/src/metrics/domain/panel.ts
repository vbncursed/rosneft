import type { Unit } from "./series.ts";

export const RANGES = ["1h", "6h", "24h", "7d"] as const;
export type Range = (typeof RANGES)[number];

export function isRange(v: string): v is Range {
  return (RANGES as readonly string[]).includes(v);
}

// PanelView is everything the dashboard renders for one panel. The PromQL and
// the panel kind live in the Go registry (gateway internal/metrics): the
// client sends an id, the server resolves it. So no PromQL reaches the browser
// bundle and no arbitrary Prometheus query can be issued from it.
export type PanelView = {
  id: string;
  title: string;
  unit: Unit;
};
