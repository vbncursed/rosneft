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
