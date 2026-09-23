import { queryOptions } from "@tanstack/react-query";
import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";

export type ConsoleSummary = components["schemas"]["ConsoleSummary"];

/**
 * Home's console counts in one call: the gateway answers only the cards the
 * caller may open and counts each server-side. `no-store` there, so staleTime
 * 0 here — a count that just changed on a console screen must not wait out
 * the client's minute.
 */
export const consoleSummaryQuery = queryOptions({
  queryKey: ["console-summary"],
  queryFn: () => httpGet<ConsoleSummary>("/api/console/summary"),
  staleTime: 0,
});
