import { infiniteQueryOptions } from "@tanstack/react-query";
import { listMyAudit } from "./audit-gateway";

/** The caller's own feed (Home's activity, /account). Not keyed on filters — it has none. */
export const myAuditQuery = infiniteQueryOptions({
  queryKey: ["audit", "mine"],
  initialPageParam: null as number | null,
  queryFn: ({ pageParam }) => listMyAudit(pageParam),
  getNextPageParam: (last) => last.nextCursor,
  // Live, like the journal: a write elsewhere must show on the next mount.
  staleTime: 0,
});
