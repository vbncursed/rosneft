import { queryOptions } from "@tanstack/react-query";
import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";

export type ConsoleSummary = components["schemas"]["ConsoleSummary"];

/**
 * Home's console counts in one call: the gateway answers only the cards the
 * caller may open and counts each server-side. `no-store` there, so staleTime
 * 0 here — a count that just changed on a console screen must not wait out
 * the client's minute. `tzOffset` is the reader's zone in minutes east of
 * UTC, so `audit24h` counts the same local-hour buckets the journal draws;
 * it is read per call and keyed, since the zone can change under a live tab.
 */
export function consoleSummaryQuery() {
  // `0 -`, not unary minus: a UTC reader's -0 would key apart from 0.
  const tzOffset = 0 - new Date().getTimezoneOffset();
  return queryOptions({
    queryKey: ["console-summary", tzOffset],
    queryFn: () => httpGet<ConsoleSummary>(`/api/console/summary?tzOffset=${tzOffset}`),
    staleTime: 0,
  });
}
