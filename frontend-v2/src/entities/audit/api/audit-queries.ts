import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import { listAudit, listAuditActors, type AuditFilters } from "./audit-gateway";

const FOLLOW_MS = 30_000;
const WINDOW_LIMIT = 200;

/** Follow only while the first page is the only one: refetching N pages every 30 s is not "live". */
export const followInterval = (pages: number): number | false => (pages <= 1 ? FOLLOW_MS : false);

export const auditQuery = (filters: AuditFilters) =>
  infiniteQueryOptions({
    queryKey: ["audit", filters],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => listAudit(filters, pageParam),
    getNextPageParam: (last) => last.nextCursor,
    // A changed filter is a new key with nothing cached, so the query would
    // report "loading" and the screen would unmount the filter bar under the
    // typing hand. The previous page stays on screen until the new one lands.
    placeholderData: keepPreviousData,
    refetchInterval: (query) => followInterval(query.state.data?.pages.length ?? 0),
    refetchIntervalInBackground: false,
  });

export const auditActorsQuery = queryOptions({
  queryKey: ["audit", "actors"],
  queryFn: listAuditActors,
});

/** The last 24 hours, unfiltered, capped — feeds the activity strip and the counters. */
export const auditWindowQuery = (from: string) =>
  queryOptions({
    queryKey: ["audit", "window", from],
    queryFn: () => listAudit({ from }, null, WINDOW_LIMIT),
  });
