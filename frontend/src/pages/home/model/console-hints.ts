import { plural } from "./home-view";

export type ConsoleHint = { kind: "static" | "count" | "unavailable"; text: string };

/** What a locked or still-loading card says about its screen. */
export const STATIC_HINTS = {
  users: "people and roles",
  roles: "who may do what",
  content: "territories and models",
  access: "who sees which territory",
  audit: "every change, newest first",
  metrics: "conversion health and alerts",
} as const;

/** The six console screens Home counts for — the keys `SCREENS` hands down. */
export type ConsoleKey = keyof typeof STATIC_HINTS;

/** Deleted accounts are not users; the gateway counts them out. */
export const usersHint = (total: number, frozen: number): string =>
  frozen > 0 ? `${plural(total, "user", "users")} · ${frozen} frozen` : plural(total, "user", "users");

export const rolesHint = (roles: number, permissions: number): string =>
  `${plural(roles, "role", "roles")} · ${plural(permissions, "permission", "permissions")}`;

export const contentHint = (territories: number, models: number): string =>
  `${plural(territories, "territory", "territories")} · ${plural(models, "model", "models")}`;

export const accessHint = (grants: number): string => plural(grants, "grant", "grants");

/** The same 24 hourly buckets the audit page draws, counted by the gateway. */
export const auditHint = (events: number): string => `${plural(events, "event", "events")} · 24h`;

export const metricsHint = (firing: number): string =>
  firing === 0 ? "no alerts firing" : `${plural(firing, "alert", "alerts")} firing`;

export function hintOf(
  key: string,
  state: { locked: boolean; loading: boolean; failed: boolean },
  count: string | null,
): ConsoleHint {
  if (state.locked || state.loading)
    return { kind: "static", text: STATIC_HINTS[key as ConsoleKey] ?? "" };
  if (state.failed || count === null) return { kind: "unavailable", text: "count unavailable" };
  return { kind: "count", text: count };
}
