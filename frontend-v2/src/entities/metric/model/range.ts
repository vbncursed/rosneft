/** The windows the metrics screen can be read over. */
export type MetricsRange = "15m" | "1h" | "6h" | "24h" | "7d";

export const METRIC_RANGES: MetricsRange[] = ["15m", "1h", "6h", "24h", "7d"];

/** Seconds in each window, for a caller sizing a query. */
export const RANGE_SECONDS: Record<MetricsRange, number> = {
  "15m": 900,
  "1h": 3600,
  "6h": 21_600,
  "24h": 86_400,
  "7d": 604_800,
};

/** Narrows a search-param or stored string to a range the picker actually offers. */
export const isRange = (v: unknown): v is MetricsRange =>
  typeof v === "string" && (METRIC_RANGES as string[]).includes(v);
