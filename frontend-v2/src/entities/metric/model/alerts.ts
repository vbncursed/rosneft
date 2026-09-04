import type { AlertSeverity } from "./metric";
import type { MetricSeries } from "./series";

export type AlertSummary = { name: string; meta: string; state: AlertSeverity; service: string; severity: string };

/** One summary per ALERTS series; firing vs pending is the alertstate label. */
export function alertsOf(series: MetricSeries[]): AlertSummary[] {
  return series.map((s) => {
    const service = s.labels.service ?? "";
    const severity = s.labels.severity ?? "";
    return {
      name: s.labels.alertname ?? s.label,
      meta: [service, severity ? `severity: ${severity}` : ""].filter(Boolean).join(" · "),
      state: s.labels.alertstate === "firing" ? "firing" : "pending",
      service,
      severity,
    };
  });
}
