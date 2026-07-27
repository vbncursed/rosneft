import { redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { getToken } from "@/auth/infrastructure/token-store";
import { meQuery } from "@/auth/application/me-query";
import { can } from "@/auth/domain/principal";

// Cheap synchronous guard for protected routes: no token → bounce to /login,
// preserving where the user was headed. Token validity (expiry/revocation) is
// NOT checked here — the first meQuery fetch 401s and client.ts hard-navigates
// to /login, so a stale token self-heals without a network call in beforeLoad.
export function requireAuth(pathname: string): void {
  if (!getToken()) {
    throw redirect({ to: "/login", search: { next: pathname } });
  }
}

// Route guard for permission-gated pages: first the cheap token check, then load
// the principal and bounce home if the permission is absent. The gateway still
// enforces the mutation — this is UX, not the security boundary.
export async function requirePermission(
  queryClient: QueryClient,
  pathname: string,
  permission: string,
): Promise<void> {
  requireAuth(pathname);
  const me = await queryClient.ensureQueryData(meQuery);
  if (!can(me, permission)) {
    throw redirect({ to: "/" });
  }
}
