import type { ConsoleNavItem } from "@/widgets/console-nav";
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

type Screen = {
  path: ConsolePath;
  key: string;
  label: string;
  allowed: (p: Principal) => boolean;
};

// What each screen needs before it is worth landing on. `can` answers true for
// anything an owner asks about, so an owner stops at the first entry and a
// non-owner falls through to whatever they actually hold — which is how
// Metrics, owner-only and last, is nobody's landing page and answers nobody a
// 403. Content mirrors the production console: either write grant opens it.
const SCREENS: readonly Screen[] = [
  { path: "/console/users", key: "users", label: "Users", allowed: (p) => can(p, "users:read") },
  { path: "/console/roles", key: "roles", label: "Roles & Permissions", allowed: (p) => can(p, "roles:read") },
  {
    path: "/console/content",
    key: "content",
    label: "Content",
    allowed: (p) => can(p, "territory:write") || can(p, "model:write"),
  },
  { path: "/console/access", key: "access", label: "Territory access", allowed: (p) => p.isOwner },
  { path: "/console/audit", key: "audit", label: "Audit journal", allowed: (p) => can(p, "audit:read") },
  { path: "/console/metrics", key: "metrics", label: "Metrics", allowed: (p) => p.isOwner },
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
  return SCREENS.find((s) => s.allowed(me))?.path ?? null;
}

/**
 * The per-screen gate. The console gate is an OR over several grants, so a
 * roles-only administrator gets past it and would reach /console/users, where
 * every request 403s. Each screen route's loader asks this and bounces to
 * /console, whose landing logic never picks a screen that fails it.
 */
export function screenAllowed(me: Principal, path: ConsolePath): boolean {
  return SCREENS.find((s) => s.path === path)?.allowed(me) ?? false;
}

/** The navigation column: every screen, the closed ones marked, never hidden. */
export function consoleNav(me: Principal): ConsoleNavItem[] {
  return SCREENS.map((s) => ({
    key: s.key,
    label: s.label,
    href: s.path,
    ...(s.allowed(me) ? {} : { disabled: true }),
  }));
}

/** "/console/audit/123" → "audit"; "/console" → "". */
export const activeSection = (pathname: string): string =>
  SCREENS.find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`))?.key ?? "";

/** The identity line at the foot of the sidebar. */
export function viewerOf(me: Principal): { username: string; roleTitle: string } {
  const first = me.roleSlugs[0];
  const roleTitle = first ? (me.roleTitles[first] ?? first) : me.isOwner ? "Root" : "—";
  return { username: me.username, roleTitle };
}

/** The catalog shell's exact routes — no sidebar, unlike the console. */
export const CATALOG_PATHS = [
  "/territories",
  "/territories/new",
  "/models",
  "/models/new",
  "/account",
  "/account/two-factor",
] as const;

const MODEL_PAGE = /^\/models\/[^/]+$/;
const REPLACE_FORM = /^\/territories\/[^/]+\/replace$/;

/**
 * A catalog screen href, query string included: the four list/upload routes,
 * the account page and its two-factor wizard, a model's page and a
 * territory's replace form.
 * Deliberately not `/territories/<slug>` — the viewer still leaves to the old
 * SPA, so a click on one must fall through to a real navigation.
 */
export const isCatalogHref = (href: string): boolean => {
  const path = href.split("?")[0];
  return (CATALOG_PATHS as readonly string[]).includes(path) || MODEL_PAGE.test(path) || REPLACE_FORM.test(path);
};

type ClickModifiers = {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
};

const plainLeftClick = (e: ClickModifiers): boolean =>
  !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0;

/**
 * Whether a click on an anchor should be handed to the router instead of the
 * browser: a same-app console or catalog link, on a plain left click.
 * Anything else — a modified click (new tab/window, extend selection) or a
 * non-primary button — must fall through to a real navigation.
 */
export const routesInApp = (href: string | null | undefined, e: ClickModifiers): boolean =>
  !!href && (href.startsWith("/console") || isCatalogHref(href)) && plainLeftClick(e);
