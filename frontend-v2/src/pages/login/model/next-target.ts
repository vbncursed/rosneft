const FALLBACK = "/console";

/**
 * Validates the `?next=` search param a bounced visitor carries back to
 * login (see `app/router/guard.ts`'s `redirectTarget` and the 401 bounce in
 * `shared/api/client.ts`, both of which build one). `next` comes off the URL,
 * so it is attacker-controlled: only a same-origin absolute path — a single
 * leading `/`, not `//` — is accepted. Anything else (a protocol-relative or
 * absolute URL, a relative path, nothing at all) falls back to `/console`.
 */
export function nextTarget(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return FALLBACK;
  return next;
}
