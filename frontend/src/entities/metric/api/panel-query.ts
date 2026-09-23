import { queryOptions } from "@tanstack/react-query";
import { PANELS, type PanelId } from "../model/panel-catalog";
import type { MetricsRange } from "../model/range";
import { fetchPanels } from "./metrics-gateway";

const POLL_MS = 30_000;
const ALL = Object.keys(PANELS) as PanelId[];

/** Every panel over one range, one cache entry, polled while the tab is visible. The route answers no-store, so there is no ETag to lose. */
export const panelsQuery = (range: MetricsRange) =>
  queryOptions({
    queryKey: ["metrics", range],
    queryFn: () => fetchPanels(ALL, range),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
