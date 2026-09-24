// The session itself is an httpOnly cookie the browser sends on its own and
// this code cannot read. What is left here is a flag saying a session was once
// established, so the route guard can bounce an anonymous visitor without an
// awaited round trip.
//
// It holds no secret and is not trusted: validity is checked by the first
// `me` query, whose 401 sends the user to /login. The flag can be stale — a
// server-side logout or a revoked session leaves it set — and that is
// deliberate.
const KEY = "andrey.authed";

export function isAuthed(): boolean {
  return localStorage.getItem(KEY) === "1";
}

export function markAuthed(): void {
  localStorage.setItem(KEY, "1");
}

export function clearAuthed(): void {
  localStorage.removeItem(KEY);
}

// When `shared/api/client.ts` last sent this tab to the enrolment gate. Per
// tab and short-lived, so sessionStorage; the gate reads it to break a loop
// (see `gateExit` in app/router/guard.ts). Storage can throw — never fatal.
const BOUNCE_KEY = "andrey.enrollBounce";

export function markEnrollBounce(): void {
  try {
    sessionStorage.setItem(BOUNCE_KEY, String(Date.now()));
  } catch {
    // no record, no loop guard: the old behaviour
  }
}

export function enrollBouncedAt(): number | null {
  try {
    const at = Number(sessionStorage.getItem(BOUNCE_KEY));
    return at > 0 ? at : null;
  } catch {
    return null;
  }
}
