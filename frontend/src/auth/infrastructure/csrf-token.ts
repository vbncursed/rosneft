// The anti-CSRF token lives in memory for the lifetime of the tab and nowhere
// else. Not localStorage, not a cookie: both outlive the tab and would be one
// more secret at rest for no gain. Every page load re-reads it from
// /api/auth/me, which the app already calls before it can render anything.
//
// It is not a substitute for the session — that is the httpOnly cookie the
// browser sends on its own. This is the proof that a request came from our own
// page rather than from somebody else's, which the cookie alone cannot give.
let token: string | null = null;

export function setCsrfToken(t: string): void {
  token = t;
}

export function getCsrfToken(): string | null {
  return token;
}

export function clearCsrfToken(): void {
  token = null;
}
