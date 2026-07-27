import { queryOptions } from "@tanstack/react-query";
import { getMe } from "@/auth/infrastructure/auth-gateway";

// The signed-in principal. Shared query key so UserMenu, guards and future
// routes all read one cache entry. getMe throws on 401 — client.ts turns that
// into a hard bounce to /login, so a stale token self-heals.
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: getMe,
});
