import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { getToken } from "@/auth/infrastructure/token-store";
import { meQuery } from "@/auth/application/me-query";
import { can, type Principal } from "@/auth/domain/principal";

// Takes the whole location rather than a pathname: `href` carries the query
// string, and dropping it loses ?jobId= — the deep link that subscribes the
// conversion screen to SSE. client.ts's 401 redirect keeps the search too, so
// the two paths would otherwise disagree.
type Target = { href: string };

// Cheap synchronous guard for protected routes: no token → bounce to /login,
// preserving where the user was headed. Token validity (expiry/revocation) is
// NOT checked here — the first meQuery fetch 401s and client.ts hard-navigates
// to /login, so a stale token self-heals without a network call in beforeLoad.
export function requireAuth(location: Target): void {
  if (!getToken()) {
    throw redirect({ to: "/login", search: { next: location.href } });
  }
}

// Route guard for permission-gated pages: first the cheap token check, then load
// the principal and bounce home if the permission is absent. The gateway still
// enforces the mutation — this is UX, not the security boundary.
// The console's landing page depends on what the principal can read. The
// layout gate is an OR of users:read / roles:read, so hardcoding /admin/users
// as the fallback sends a roles-only user from one forbidden page to another —
// where the table 403s against the gateway instead of redirecting.
export function consoleLanding(me: Principal): "/admin/users" | "/admin/roles" {
  return can(me, "users:read") ? "/admin/users" : "/admin/roles";
}

// Guard for a console page that needs one specific permission. Denial lands on
// whichever console page the principal can actually open.
export async function requireConsolePermission(
  queryClient: QueryClient,
  location: Target,
  permission: string,
): Promise<void> {
  requireAuth(location);
  const me = await queryClient.ensureQueryData(meQuery);
  if (!can(me, permission)) {
    throw redirect({ to: consoleLanding(me) });
  }
}

export async function requirePermission(
  queryClient: QueryClient,
  location: Target,
  permission: string,
): Promise<void> {
  requireAuth(location);
  const me = await queryClient.ensureQueryData(meQuery);
  if (!can(me, permission)) {
    throw redirect({ to: "/" });
  }
}
