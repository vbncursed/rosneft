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
    const service = s.labels.service ?? "";
    const severity = s.labels.severity ?? "";
    const name = s.labels.alertname ?? s.label;
    const key = [name, service, severity].join(" ");
    const firing = s.labels.alertstate === "firing";
    const existing = byRule.get(key);
    if (existing) {
      existing.count += 1;
      if (firing) existing.state = "firing";
      continue;
    }
    byRule.set(key, {
      name,
      meta: [service, severity ? `severity: ${severity}` : ""].filter(Boolean).join(" · "),
      state: firing ? "firing" : "pending",
      service,
      severity,
      count: 1,
    });
  }
  return [...byRule.values()].map(({ count, ...summary }) => ({
    ...summary,
    meta: count > 1 ? `${summary.meta} · ${count} instances` : summary.meta,
  }));
}
