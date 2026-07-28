import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchAuditPage } from "@/audit/infrastructure/audit-gateway";
import type { AuditFilters } from "@/audit/domain/audit-entry";

// The journal is append-only and grows from the top, so a page already fetched
// never changes. Cursor paging over descending id keeps pages stable even while
// new entries land above them — an offset would shift rows under the reader.
export function useAuditLog(filters: AuditFilters) {
  const query = useInfiniteQuery({
    queryKey: ["audit", filters],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => fetchAuditPage(filters, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });

  return {
    entries: query.data?.pages.flatMap((p) => p.entries) ?? [],
    isLoading: query.isLoading,
    error: query.error,
    hasMore: !!query.hasNextPage,
    loadMore: query.fetchNextPage,
    isLoadingMore: query.isFetchingNextPage,
  };
}
