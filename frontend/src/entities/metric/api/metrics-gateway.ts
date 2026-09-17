import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { PanelId } from "../model/panel-catalog";
import type { MetricsRange } from "../model/range";
import type { MetricSeries } from "../model/series";

type SeriesDto = components["schemas"]["MetricSeries"];

export const fetchPanel = async (panel: PanelId, range: MetricsRange): Promise<MetricSeries[]> =>
  ((await httpGet<SeriesDto[] | null>(`/api/metrics/query?panel=${panel}&range=${range}`)) ?? []).map((s) => ({
    label: s.label,
    points: s.points ?? [],
    labels: s.labels ?? {},
  }));
