const FALLBACK = "/console";

/**
 * Validates the `?next=` search param a bounced visitor carries back to
 * login (see `app/router/guard.ts`'s `redirectTarget` and the 401 bounce in
 * `shared/api/client.ts`, both of which build one). `next` comes off the URL,
 * so it is attacker-controlled: only a same-origin absolute path — a single
 * leading `/`, not `//` and not `/\` — is accepted. Anything else (a
 * protocol-relative or absolute URL, a relative path, nothing at all) falls
 * back to `/console`.
 *
 * The backslash is not a second guess at the same case: browsers normalise it
 * to a forward slash in the authority position, so `/\evil.com` is
 * protocol-relative to anything that parses a URL out of this string. Nothing
 * here may depend on `navigate({ href })` happening to keep the pathname and
 * throw the inferred host away.
 */
export function nextTarget(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return FALLBACK;
  }
  return next;
}
