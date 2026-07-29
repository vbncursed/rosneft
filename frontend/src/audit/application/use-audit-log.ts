import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchAuditPage } from "@/audit/infrastructure/audit-gateway";
import type { AuditFilters } from "@/audit/domain/audit-entry";
import type { Refs } from "@/audit/domain/ref-label";

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
    // Словари страниц не конфликтуют: ключ несёт значение идентификатора, а
    // одно и то же значение везде означает одну и ту же строку.
    refs: Object.assign({}, ...(query.data?.pages.map((p) => p.refs) ?? [])) as Refs,
    isLoading: query.isLoading,
    error: query.error,
    hasMore: !!query.hasNextPage,
    loadMore: query.fetchNextPage,
    isLoadingMore: query.isFetchingNextPage,
  };
}
