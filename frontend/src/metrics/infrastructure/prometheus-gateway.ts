// Относительные импорты с расширением: этот модуль покрыт node:test, а тот
// алиас `@/` не резолвит — так же сделано в остальных тестируемых модулях.
import { RANGE_SECONDS, stepSeconds, type PanelDef, type Range } from "../domain/panel.ts";
import type { Point, Series } from "../domain/series.ts";

const PROMETHEUS = process.env.PROMETHEUS_URL ?? "http://prometheus:9090";

// Форма ответа Prometheus — деталь реализации этого файла и наружу не выходит.
type PromMetric = Record<string, string>;
type PromSample = [number, string];
type PromResult = { metric: PromMetric; values?: PromSample[]; value?: PromSample };
type PromBody = {
  status: string;
  error?: string;
  data?: { resultType: string; result: PromResult[] };
};

// Лейбл серии: первый попавшийся осмысленный, иначе просто «value».
const LABEL_KEYS = ["service", "grpc_service", "status", "alertname", "code", "method"];

function labelOf(metric: PromMetric): string {
  for (const k of LABEL_KEYS) if (metric[k]) return metric[k];
  const rest = Object.entries(metric).filter(([k]) => k !== "__name__" && k !== "stack");
  return rest.length ? rest.map(([k, v]) => `${k}=${v}`).join(",") : "value";
}

export function toSeries(body: unknown): Series[] {
  const b = body as PromBody;
  if (b?.status !== "success") throw new Error(b?.error ?? "prometheus query failed");
  const out: Series[] = [];
  for (const r of b.data?.result ?? []) {
    const samples = r.values ?? (r.value ? [r.value] : []);
    const points: Point[] = [];
    for (const [t, raw] of samples) {
      const v = Number(raw);
      // NaN/±Inf штатно приходят из histogram_quantile без трафика — это не точки.
      if (Number.isFinite(v)) points.push({ t, v });
    }
    if (points.length) out.push({ label: labelOf(r.metric), points });
  }
  return out;
}

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
