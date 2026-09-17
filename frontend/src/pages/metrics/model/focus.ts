import { matchesService, type MetricSeries } from "@/entities/metric";

/** How many services a per-service panel plots before it starts counting instead. */
const PLOTTED = 3;

const lastValue = (s: MetricSeries) => s.points.at(-1)?.v ?? 0;

/**
 * Which service a series belongs to. `red-latency` groups by `grpc_service`
 * rather than the scrape label, so a panel keyed on `service` alone left the
 * one chart with the longest legend unfocused.
 */
const serviceOf = (s: MetricSeries) => s.labels.service ?? s.labels.grpc_service;

/**
 * What a per-service panel draws. Twelve services on one chart is a hairball,
 * so with none selected it plots the three loudest and says how many it left
 * off; selecting one narrows to it. A series the panel plots without a service
 * label — a total, a status split — is not a service and is never hidden.
 */
export function focusSeries(
  series: MetricSeries[],
  selected: string | null,
): { series: MetricSeries[]; hidden: number } {
  const named = series.filter((s) => serviceOf(s) !== undefined);
  if (named.length === 0) return { series, hidden: 0 };

  const plain = series.filter((s) => serviceOf(s) === undefined);
  if (selected !== null) {
    const hit = named.filter((s) => matchesService(serviceOf(s)!, selected));
    return { series: [...plain, ...hit], hidden: 0 };
  }
  const loudest = [...named].sort((a, b) => lastValue(b) - lastValue(a)).slice(0, PLOTTED);
  return { series: [...plain, ...loudest], hidden: named.length - loudest.length };
}

// `/pkg.Service/Method`, the full method a gRPC call carries, and the bare
// `pkg.Service` the latency panel groups by. A name with neither — a scrape
// name like "gateway" — has nothing to shorten and is returned untouched.
const FULL_METHOD = /^\/([\w.]+)\.(\w+)\/(\w+)$/;
const BARE_SERVICE = /^[\w.]+\.(\w+)$/;

const trim = (service: string) => service.replace(/Service$/, "");

/**
 * "/rosneft.catalog.v1.CatalogService/ListTerritories" → "Catalog.ListTerritories";
 * "rosneft.catalog.v1.CatalogService" → "Catalog".
 */
export function shortGrpcLabel(label: string): string {
  const method = FULL_METHOD.exec(label);
  if (method) return `${trim(method[2])}.${method[3]}`;
  const bare = BARE_SERVICE.exec(label);
  return bare ? trim(bare[1]) : label;
}
