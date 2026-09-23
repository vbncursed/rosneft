import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { PanelId } from "../model/panel-catalog";
import type { MetricsRange } from "../model/range";
import type { MetricSeries } from "../model/series";

type SeriesDto = components["schemas"]["MetricSeries"];
type PanelsDto = components["schemas"]["MetricsPanels"];

/** Each answered panel's series; a panel Prometheus could not answer is absent. */
export type PanelSeries = Partial<Record<PanelId, MetricSeries[]>>;

const toSeries = (s: SeriesDto): MetricSeries => ({
  label: s.label,
  points: s.points ?? [],
  labels: s.labels ?? {},
});

/** Every asked panel over one range, in one request. A null panel is no series; a null body, no panel. */
export async function fetchPanels(panels: PanelId[], range: MetricsRange): Promise<PanelSeries> {
  const query = new URLSearchParams([...panels.map((p) => ["panel", p]), ["range", range]]);
  const body = await httpGet<PanelsDto>(`/api/metrics/query?${query.toString()}`);
  return Object.fromEntries(
    Object.entries(body ?? {}).map(([id, series]) => [id, (series ?? []).map(toSeries)]),
  );
}
