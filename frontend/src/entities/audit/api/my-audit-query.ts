import { infiniteQueryOptions } from "@tanstack/react-query";
import { listMyAudit } from "./audit-gateway";

/** The account screen's feed. Not keyed on filters — it has none. */
export const myAuditQuery = infiniteQueryOptions({
  queryKey: ["audit", "mine"],
  initialPageParam: null as number | null,
  queryFn: ({ pageParam }) => listMyAudit(pageParam),
  getNextPageParam: (last) => last.nextCursor,
});
