import type { Unit } from "./series.ts";

export const RANGES = ["1h", "6h", "24h", "7d"] as const;
export type Range = (typeof RANGES)[number];

export const RANGE_SECONDS: Record<Range, number> = {
  "1h": 3600,
  "6h": 21600,
  "24h": 86400,
  "7d": 604800,
};

export function isRange(v: string): v is Range {
  return (RANGES as readonly string[]).includes(v);
}

/** Prometheus скрейпит раз в 15s — точек чаще этого не существует. */
const SCRAPE = 15;
const TARGET_POINTS = 200;

/** Шаг query_range: ~200 точек на диапазон, округлённо до целых скрейпов. */
export function stepSeconds(range: Range): number {
  const raw = RANGE_SECONDS[range] / TARGET_POINTS;
  return Math.max(SCRAPE, Math.round(raw / SCRAPE) * SCRAPE);
}

export type PanelKind = "line" | "stat" | "alerts";

/**
 * Определение панели. `expr` живёт только на сервере: клиент присылает id,
 * роут резолвит его сюда. Так в браузерный бандл не попадает PromQL и не
 * появляется возможность выполнить произвольный запрос к Prometheus.
 */
export type PanelDef = {
  id: string;
  title: string;
  unit: Unit;
  kind: PanelKind;
  expr: string;
  instant?: boolean;
};
