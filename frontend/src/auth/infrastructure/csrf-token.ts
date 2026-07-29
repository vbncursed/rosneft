import { isAuthed } from "@/auth/infrastructure/session-marker";

// The anti-CSRF token lives in memory for the lifetime of the tab and nowhere
// else. Not localStorage, not a cookie: both outlive the tab and would be one
// more secret at rest for no gain.
//
// It is not a substitute for the session — that is the httpOnly cookie the
// browser sends on its own. This is the proof that a request came from our own
// page rather than somebody else's, which the cookie alone cannot give.
let token: string | null = null;

// inFlight deduplicates the refresh below. Without it, a page that fires three
// mutations at once on a cold start would ask for the same token three times.
let inFlight: Promise<string | null> | null = null;

export function setCsrfToken(t: string): void {
  token = t;
}

export function getCsrfToken(): string | null {
  return token;
}

export function clearCsrfToken(): void {
  token = null;
}

// ensureCsrfToken returns the token, fetching it first if this tab has none.
//
// A page load starts with an empty module, so the token is absent until the
// app's own meQuery lands — and nothing makes a mutation wait for that. The
// route guard is synchronous (a localStorage flag) and the layout renders its
// children while meQuery is still in flight, so a scene is interactive, and its
// gizmo can commit a PUT, inside that window. Sending the mutation anyway meant
// a 403 the user saw as a lost edit.
//
// Fixing it here rather than by awaiting meQuery in the route guard keeps first
// paint unblocked and covers every other way the token can go missing — a
// rotated GATEWAY_CSRF_SECRET, for one — not just the reload.
//
// The fetch is deliberately raw rather than the shared http client: that client
// imports this module, and calling back into it would close a cycle.
export async function ensureCsrfToken(): Promise<string | null> {
  if (token) return token;
  // No session means nothing to fetch, and asking would 401. This also keeps
  // the login POST itself — which is public and needs no token — from paying
  // for a doomed round trip.
  if (!isAuthed()) return null;
  inFlight ??= fetchCsrfToken().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function fetchCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { csrfToken?: string };
    if (body.csrfToken) token = body.csrfToken;
    return token;
  } catch {
    // Offline or the gateway is down. The mutation goes out without a token and
    // fails on its own terms, which is a better error than one invented here.
    return null;
  }
}
