// The session itself is an httpOnly cookie the browser sends on its own and this
// code cannot read. What is left here is a flag saying a session was once
// established, so the route guard can bounce an anonymous visitor without an
// awaited round trip.
//
// It holds no secret and is not trusted: exactly as before, validity is checked
// by the first meQuery, whose 401 sends the user to /login. The flag can be
// stale — a server-side logout or a revoked session leaves it set — and that is
// the same behaviour the token had.
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
