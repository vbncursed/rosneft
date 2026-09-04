/** The windows the metrics screen can be read over. */
export type MetricsRange = "15m" | "1h" | "6h" | "24h" | "7d";

export const METRIC_RANGES: MetricsRange[] = ["15m", "1h", "6h", "24h", "7d"];

/** Narrows a search-param or stored string to a range the picker actually offers. */
export const isRange = (v: unknown): v is MetricsRange =>
  typeof v === "string" && (METRIC_RANGES as string[]).includes(v);
