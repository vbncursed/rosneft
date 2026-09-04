import { matchesService } from "./match";
import { formatValue } from "./panel-catalog";
import type { MetricSeries } from "./series";
import type { ServiceHealth } from "./service";

const SAMPLES = 18;
const last = (s: MetricSeries | undefined) => (s && s.points.length > 0 ? s.points[s.points.length - 1].v : null);
const byLabel = (series: MetricSeries[], name: string) => series.find((s) => s.label === name);

/**
 * One row per service name the up panel knows. Down comes only from up; degraded
 * from a non-zero error rate; latency is paired by name, see matchesService —
 * a miss reads "—".
 */
export function servicesOf(
  up: MetricSeries[],
  rate: MetricSeries[],
  errors: MetricSeries[],
  latency: MetricSeries[],
): ServiceHealth[] {
  // A service scraped as several replicas (mesh-worker) is several series with
  // one label; it is up when any replica answers.
  const names = [...new Set(up.map((u) => u.label))];
  return names.map((name) => {
    const isUp = up.filter((u) => u.label === name).some((u) => last(u) === 1);
    const rps = last(byLabel(rate, name));
    const err = last(byLabel(errors, name));
    const lat = last(latency.find((s) => matchesService(s.label, name)));
    const state = !isUp ? "down" : err !== null && err > 0 ? "degraded" : "up";
    return {
      name,
      state,
      meta: isUp ? `${formatValue(rps, "rps")} · ${formatValue(err, "rps").replace("/s", "")} errors/s` : "scrape failed",
      samples: isUp ? (byLabel(rate, name)?.points ?? []).slice(-SAMPLES).map((p) => p.v) : [],
      latency: isUp ? formatValue(lat, "seconds") : "—",
      errors: isUp ? formatValue(err, "rps") : "—",
    };
  });
}
