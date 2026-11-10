import type { AlertSeverity } from "./metric";
import type { MetricSeries } from "./series";

export type AlertSummary = { name: string; meta: string; state: AlertSeverity; service: string; severity: string };

/**
 * One summary per alert *rule*, not per series. Prometheus evaluates a rule
 * per scraped instance, so a replicated service (mesh-worker runs two) fires
 * the same alertname/service/severity twice with only `instance` differing —
 * collapse those into one summary (firing if any instance is) or the count
 * and the inspector both lie about there being two distinct alerts.
 */
export function alertsOf(series: MetricSeries[]): AlertSummary[] {
  const byRule = new Map<string, AlertSummary & { count: number }>();
  for (const s of series) {
    const summary = alertOf(s);
    const key = [summary.name, summary.service, summary.severity].join(" ");
    const existing = byRule.get(key);
    if (existing) {
      existing.count += 1;
      if (summary.state === "firing") existing.state = "firing";
      continue;
    }
    byRule.set(key, { ...summary, count: 1 });
  }
  return [...byRule.values()].map(({ count, ...summary }) => ({
    ...summary,
    meta: count > 1 ? `${summary.meta} · ${count} instances` : summary.meta,
  }));
}

function alertOf(series: MetricSeries): AlertSummary {
  const service = series.labels.service ?? "";
  const severity = series.labels.severity ?? "";
  return {
    name: series.labels.alertname ?? series.label,
    meta: [service, severity ? `severity: ${severity}` : ""].filter(Boolean).join(" · "),
    state: series.labels.alertstate === "firing" ? "firing" : "pending",
    service,
    severity,
  };
}
