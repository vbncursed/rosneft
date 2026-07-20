import { RANGE_SECONDS, stepSeconds, type PanelDef, type Range } from "@/metrics/domain/panel";
import type { Series } from "@/metrics/domain/series";
import { toSeries } from "./prom-response";

const PROMETHEUS = process.env.PROMETHEUS_URL ?? "http://prometheus:9090";

export async function fetchPanel(panel: PanelDef, range: Range): Promise<Series[]> {
  const now = Math.floor(Date.now() / 1000);
  const url = new URL(panel.instant ? "/api/v1/query" : "/api/v1/query_range", PROMETHEUS);
  url.searchParams.set("query", panel.expr);
  if (panel.instant) {
    url.searchParams.set("time", String(now));
  } else {
    url.searchParams.set("start", String(now - RANGE_SECONDS[range]));
    url.searchParams.set("end", String(now));
    url.searchParams.set("step", String(stepSeconds(range)));
  }
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`prometheus ${res.status}`);
  return toSeries(await res.json());
}
