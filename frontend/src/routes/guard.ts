import { redirect } from "@tanstack/react-router";
import { getToken } from "@/auth/infrastructure/token-store";

// Cheap synchronous guard for protected routes: no token → bounce to /login,
// preserving where the user was headed. Token validity (expiry/revocation) is
// NOT checked here — the first meQuery fetch 401s and client.ts hard-navigates
// to /login, so a stale token self-heals without a network call in beforeLoad.
export function requireAuth(pathname: string): void {
  if (!getToken()) {
    throw redirect({ to: "/login", search: { next: pathname } });
  }
}
