import { bucketOf, WINDOW_LIMIT, type AuditEntry } from "@/entities/audit";
import type { AlertSummary } from "@/entities/metric";
import type { Permission } from "@/entities/permission";
import type { Role } from "@/entities/role";
import type { User } from "@/entities/user";
import { plural } from "./home-view";

export type ConsoleHint = { kind: "static" | "count" | "unavailable"; text: string };

/** What a locked or still-loading card says about its screen. */
export const STATIC_HINTS: Record<string, string> = {
  users: "people and roles",
  roles: "who may do what",
  content: "territories and models",
  access: "who sees which territory",
  audit: "every change, newest first",
  metrics: "conversion health and alerts",
};

// The list is fetched with includeDeleted — a deleted account is not a user.
export const usersHint = (users: User[]): string => {
  const live = users.filter((u) => u.status !== "deleted");
  const frozen = live.filter((u) => u.status === "frozen").length;
  return frozen > 0 ? `${plural(live.length, "user", "users")} · ${frozen} frozen` : plural(live.length, "user", "users");
};

export const rolesHint = (roles: Role[], permissions: Permission[]): string =>
  `${plural(roles.length, "role", "roles")} · ${plural(permissions.length, "permission", "permissions")}`;

export const contentHint = (territories: number, models: number): string =>
  `${plural(territories, "territory", "territories")} · ${plural(models, "model", "models")}`;

export const accessHint = (grants: number): string => plural(grants, "grant", "grants");

/** The same 24 buckets the audit page counts, so the two screens agree. */
export const auditHint = (entries: AuditEntry[], now: Date): string => {
  if (entries.length >= WINDOW_LIMIT) return `${WINDOW_LIMIT}+ events · 24h`;
  const n = entries.filter((e) => bucketOf(e.at, now) >= 0).length;
  return `${plural(n, "event", "events")} · 24h`;
};

export const metricsHint = (alerts: AlertSummary[]): string => {
  const firing = alerts.filter((a) => a.state === "firing").length;
  return firing === 0 ? "no alerts firing" : `${firing} ${firing === 1 ? "alert" : "alerts"} firing`;
};

export function hintOf(
  key: string,
  state: { locked: boolean; loading: boolean; failed: boolean },
  count: string | null,
): ConsoleHint {
  if (state.locked || state.loading) return { kind: "static", text: STATIC_HINTS[key] ?? "" };
  if (state.failed || count === null) return { kind: "unavailable", text: "count unavailable" };
  return { kind: "count", text: count };
}
