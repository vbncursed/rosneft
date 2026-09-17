import { queryOptions } from "@tanstack/react-query";
import type { PanelId } from "../model/panel-catalog";
import type { MetricsRange } from "../model/range";
import { fetchPanel } from "./metrics-gateway";

const POLL_MS = 30_000;

/** One cache entry per panel and range; polled while the tab is visible. The route answers no-store, so there is no ETag to lose. */
export const panelQuery = (panel: PanelId, range: MetricsRange) =>
  queryOptions({
    queryKey: ["metrics", panel, range],
    queryFn: () => fetchPanel(panel, range),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
