import { queryOptions } from "@tanstack/react-query";
import { ALL_PANELS } from "../model/panel-catalog";
import type { MetricsRange } from "../model/range";
import { fetchPanels } from "./metrics-gateway";

const POLL_MS = 30_000;

/** Every panel over one range, one cache entry, polled while the tab is visible. The route answers no-store, so there is no ETag to lose. */
export const panelsQuery = (range: MetricsRange) =>
  queryOptions({
    queryKey: ["metrics", range],
    queryFn: () => fetchPanels(ALL_PANELS, range),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
