import { can, type Principal } from "@/shared/session";

type RedirectTarget = { to: "/login"; search: { next: string } };

/**
 * The decision behind the console guard, kept pure so it can be tested
 * without a router: given whether the session marker is set and the href the
 * visitor was headed to, returns null (let them through) or a descriptor the
 * route's `beforeLoad` turns into a `redirect(...)` throw.
 *
 * Takes the whole href, query string included — a deep link that loses its
 * search lands somewhere subtly different, and `shared/api/client.ts`'s own
 * 401 redirect keeps the search for the same reason.
 *
 * Does not attempt to validate the session itself. The marker is a flag, not
 * proof: a stale one gets through here and is corrected by the first 401,
 * which drops it and bounces. That is the design, not a hole.
 */
export function redirectTarget(authed: boolean, href: string): RedirectTarget | null {
  if (authed) return null;
  return { to: "/login", search: { next: href } };
}

/** Every screen the console has, in the order the navigation lists them. */
export type ConsolePath =
  | "/console/users"
  | "/console/roles"
  | "/console/content"
  | "/console/access"
  | "/console/audit"
  | "/console/metrics";

// What each screen needs before it is worth landing on. `can` answers true for
// anything an owner asks about, so an owner stops at the first entry and a
// non-owner falls through to whatever they actually hold — which is how
// Metrics, owner-only and last, is nobody's landing page and answers nobody a
// 403. Content mirrors the production console: either write grant opens it.
const LANDINGS: readonly (readonly [ConsolePath, (p: Principal) => boolean])[] = [
  ["/console/users", (p) => can(p, "users:read")],
  ["/console/roles", (p) => can(p, "roles:read")],
  ["/console/content", (p) => can(p, "territory:write") || can(p, "model:write")],
  ["/console/access", (p) => p.isOwner],
  ["/console/audit", (p) => can(p, "audit:read")],
  ["/console/metrics", (p) => p.isOwner],
];

/**
 * Where `/console` alone sends a caller: the first screen their permissions
 * actually open.
 *
 * Hardcoding one screen is the trap this exists to avoid. The console gate is
 * an OR over several grants, so naming `/console/users` as the landing sends a
 * roles-only administrator from one forbidden page to another — where the
 * table 403s against the gateway instead of redirecting.
 *
 * `null` means no console screen is open to this principal at all — a Viewer
 * holds only `territory:read` and its siblings. That is a real account, not an
 * impossible one, and it must be told so rather than bounced around the
 * subtree looking for a page that will have it.
 */
export function consoleLanding(me: Principal): ConsolePath | null {
  return LANDINGS.find(([, allowed]) => allowed(me))?.[0] ?? null;
}
