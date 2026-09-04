import type { MetricSeries } from "@/entities/metric";

/** How many services a per-service panel plots before it starts counting instead. */
const PLOTTED = 3;

const lastValue = (s: MetricSeries) => s.points.at(-1)?.v ?? 0;

/**
 * What a per-service panel draws. Twelve services on one chart is a hairball,
 * so with none selected it plots the three loudest and says how many it left
 * off; selecting one narrows to it. A series the panel plots without a
 * `service` label — a total, a status split — is not a service and is never
 * hidden.
 */
export function focusSeries(
  series: MetricSeries[],
  selected: string | null,
): { series: MetricSeries[]; hidden: number } {
  const named = series.filter((s) => s.labels.service !== undefined);
  if (named.length === 0) return { series, hidden: 0 };

  const plain = series.filter((s) => s.labels.service === undefined);
  if (selected !== null) {
    return { series: [...plain, ...named.filter((s) => s.labels.service === selected)], hidden: 0 };
  }
  const loudest = [...named].sort((a, b) => lastValue(b) - lastValue(a)).slice(0, PLOTTED);
  return { series: [...plain, ...loudest], hidden: named.length - loudest.length };
}

// `/pkg.Service/Method` — the shape a gRPC full method takes. Anything else is
// already a name a reader can hold, and is returned untouched.
const FULL_METHOD = /^\/([\w.]+)\.(\w+)\/(\w+)$/;

/** "/rosneft.catalog.v1.CatalogService/ListTerritories" → "Catalog.ListTerritories". */
export function shortGrpcLabel(label: string): string {
  const parts = FULL_METHOD.exec(label);
  if (!parts) return label;
  return `${parts[2].replace(/Service$/, "")}.${parts[3]}`;
}
