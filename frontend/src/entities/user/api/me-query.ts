import { queryOptions } from "@tanstack/react-query";
import { getMe } from "./auth-gateway";

/**
 * The signed-in principal, as one shared cache entry. Every reader — the
 * console's landing redirect today, its screens next — goes through this key
 * rather than calling the gateway again.
 *
 * It is also what makes the route guard real instead of apparent. The session
 * marker in `localStorage` is a flag, not proof: a revoked or expired session
 * still carries it, and nothing notices until something asks the gateway.
 * `getMe` throws on 401 and `shared/api/client.ts` turns that into a hard
 * bounce to /login, so loading this on the way into the console is what
 * evicts a stale session instead of seating it.
 */
export const meQuery = queryOptions({ queryKey: ["me"], queryFn: getMe });
