import type { Series } from "@/shared/ui/line-chart";

export type MetricPoint = { t: number; v: number };
export type MetricSeries = { label: string; points: MetricPoint[]; labels: Record<string, string> };

/**
 * Co-plotted series need one x axis. Aligning on the union of timestamps and
 * leaving a missing sample as null is what lets the chart break the line
 * where a scrape was missed instead of drawing a slope through an outage.
 */
export function alignSeries(series: MetricSeries[]): Series[] {
  const ts = [...new Set(series.flatMap((s) => s.points.map((p) => p.t)))].sort((a, b) => a - b);
  return series.map((s) => {
    const at = new Map(s.points.map((p) => [p.t, p.v]));
    return { label: s.label, values: ts.map((t) => at.get(t) ?? null) };
  });
}

/** The latest value of the first series — what the panel prints large. */
export function lastOf(series: MetricSeries[]): number | null {
  const pts = series[0]?.points ?? [];
  return pts.length > 0 ? pts[pts.length - 1].v : null;
}
