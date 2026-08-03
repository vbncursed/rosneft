import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchAuditPage, type AuditPage } from "@/audit/infrastructure/audit-gateway";
import type { AuditFilters } from "@/audit/domain/audit-entry";
import type { Refs } from "@/audit/domain/ref-label";

type FetchPage = (filters: AuditFilters, cursor: number | null) => Promise<AuditPage>;

// The journal is append-only and grows from the top, so a page already fetched
// never changes. Cursor paging over descending id keeps pages stable even while
// new entries land above them — an offset would shift rows under the reader.
//
// The company journal and the own-journal are separate routes, so the fetcher is
// a parameter rather than a filter: which endpoint answers is not something a
// query string should be able to change.
export function useAuditLog(
  filters: AuditFilters,
  fetchPage: FetchPage = fetchAuditPage,
  scope: "company" | "mine" = "company",
) {
  const query = useInfiniteQuery({
    // scope is part of the key: the two journals answer differently for the same
    // filters, and a shared cache entry would show one under the other.
    queryKey: ["audit", scope, filters],
    initialPageParam: null as number | null,
    queryFn: ({ pageParam }) => fetchPage(filters, pageParam),
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
