import { useQuery } from "@tanstack/react-query";
import { unanswered } from "@/shared/lib/unanswered";
import type { ConsoleNavItem } from "@/widgets/console-nav";
import {
  accessHint,
  auditHint,
  contentHint,
  hintOf,
  metricsHint,
  rolesHint,
  usersHint,
  type ConsoleHint,
  type ConsoleKey,
} from "./console-hints";
import { consoleSummaryQuery, type ConsoleSummary } from "./console-summary";

/**
 * One count per open console card, all from `GET /api/console/summary`. A
 * locked card reads its static line whatever the summary holds, and nothing
 * is asked when every card is locked — a disabled query stays `isPending`
 * forever, so `isLoading` is what "loading" reads here. A card the summary
 * nulls (its source failed) or leaves out reads "count unavailable".
 */
export function useConsoleCounters(items: ConsoleNavItem[]): Record<ConsoleKey, ConsoleHint> {
  const open = (key: string) => items.some((i) => i.key === key && !i.disabled);
  const summary = useQuery({ ...consoleSummaryQuery, enabled: items.some((i) => !i.disabled) });
  const failed = unanswered(summary) !== null;

  const hint = (key: ConsoleKey, count: (s: ConsoleSummary) => string | null): ConsoleHint =>
    hintOf(
      key,
      { locked: !open(key), loading: summary.isLoading, failed },
      summary.data ? count(summary.data) : null,
    );

  return {
    users: hint("users", ({ users }) => (users ? usersHint(users.total, users.frozen) : null)),
    roles: hint("roles", ({ roles }) => (roles ? rolesHint(roles.roles, roles.permissions) : null)),
    content: hint("content", ({ content }) =>
      content ? contentHint(content.territories, content.models) : null,
    ),
    access: hint("access", ({ access }) => (access != null ? accessHint(access) : null)),
    audit: hint("audit", ({ audit24h }) => (audit24h != null ? auditHint(audit24h) : null)),
    metrics: hint("metrics", ({ alerts }) => (alerts != null ? metricsHint(alerts) : null)),
  };
}
