import { useQueries, useQuery } from "@tanstack/react-query";
import { auditWindowQuery, windowStart } from "@/entities/audit";
import { alertsOf, panelQuery } from "@/entities/metric";
import { modelsQuery } from "@/entities/model";
import { permissionsQuery } from "@/entities/permission";
import { rolesQuery } from "@/entities/role";
import { adminsQuery, territoriesQuery } from "@/entities/territory";
import { usersQuery } from "@/entities/user";
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
} from "./console-hints";

type Q = { isLoading: boolean; data: unknown; error: unknown };

/**
 * One count per open console card, off the query its screen already uses.
 * A locked card asks nothing (`enabled: false`) — and a disabled query stays
 * `isPending` forever, so `isLoading` is what "loading" reads here.
 */
export function useConsoleCounters(items: ConsoleNavItem[]): Record<string, ConsoleHint> {
  const open = (key: string) => items.some((i) => i.key === key && !i.disabled);

  const users = useQuery({ ...usersQuery, enabled: open("users") });
  const roles = useQuery({ ...rolesQuery, enabled: open("roles") });
  const permissions = useQuery({ ...permissionsQuery, enabled: open("roles") });
  const territories = useQuery({
    ...territoriesQuery,
    enabled: open("content") || open("access"),
  });
  const models = useQuery({ ...modelsQuery, enabled: open("content") });
  const admins = useQueries({
    queries: (open("access") ? (territories.data ?? []) : []).map((t) => adminsQuery(t.slug)),
    // No territories is no grants, not an unknown count — `rs.length === 0`
    // would otherwise leave an owner with an empty catalog reading
    // "count unavailable". The card still waits on `territories` itself.
    combine: (rs) => ({
      isLoading: rs.some((r) => r.isLoading),
      data:
        rs.length === 0
          ? 0
          : rs.every((r) => r.data)
            ? rs.reduce((n, r) => n + (r.data?.length ?? 0), 0)
            : undefined,
      error: rs.map(unanswered).find((e) => e !== null) ?? null,
    }),
  });
  // Rounded to the hour inside windowStart, so the key is stable across renders.
  const auditWindow = useQuery({ ...auditWindowQuery(windowStart()), enabled: open("audit") });
  const alerts = useQuery({ ...panelQuery("alerts", "1h"), enabled: open("metrics") });
  const now = new Date();

  const hint = (key: string, qs: Q[], count: () => string | null): ConsoleHint =>
    hintOf(
      key,
      {
        locked: !open(key),
        loading: qs.some((q) => q.isLoading),
        failed: qs.some((q) => unanswered(q) !== null),
      },
      qs.every((q) => q.data !== undefined) ? count() : null,
    );

  return {
    users: hint("users", [users], () => usersHint(users.data ?? [])),
    roles: hint("roles", [roles, permissions], () =>
      rolesHint(roles.data ?? [], permissions.data ?? []),
    ),
    content: hint("content", [territories, models], () =>
      contentHint(territories.data?.length ?? 0, models.data?.length ?? 0),
    ),
    access: hint("access", [territories, admins], () =>
      admins.data === undefined ? null : accessHint(admins.data),
    ),
    audit: hint("audit", [auditWindow], () => auditHint(auditWindow.data?.entries ?? [], now)),
    metrics: hint("metrics", [alerts], () => metricsHint(alertsOf(alerts.data ?? []))),
  };
}
