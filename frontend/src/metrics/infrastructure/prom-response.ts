// Разбор ответа Prometheus в доменные серии. Файл сознательно не имеет
// значимых импортов — он покрыт node:test, а тестовый рантайм требует
// специфаер с расширением, который tsc запрещает для не-type импортов.
import type { Point, Series } from "../domain/series.ts";

// Форма ответа Prometheus — деталь реализации и наружу не выходит.
type PromMetric = Record<string, string>;
type PromSample = [number, string];
type PromResult = { metric: PromMetric; values?: PromSample[]; value?: PromSample };
type PromBody = {
  status: string;
  error?: string;
  data?: { resultType: string; result: PromResult[] };
};

// Лейбл серии: первый попавшийся осмысленный, иначе просто «value».
// `alertname` идёт первым: у серии ALERTS есть и он, и `service`, и назвать её
// именем сервиса — значит потерять, о каком вообще алерте речь. Больше ни у
// одной метрики метки `alertname` нет, так что на графики порядок не влияет.
const LABEL_KEYS = ["alertname", "service", "grpc_service", "status", "code", "method"];

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
    if (points.length) out.push({ label: labelOf(r.metric), points, labels: r.metric });
  }
  return out;
}
