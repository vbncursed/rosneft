import { httpGet, httpPost, setCsrfToken, clearCsrfToken } from "@/shared/api";
import { markAuthed, clearAuthed, type Principal } from "@/shared/session";
import type { components } from "@/shared/api/dto";
import { toPrincipal } from "./to-principal";

type AuthUserDto = components["schemas"]["AuthUser"];

interface LoginResponse {
  token: string;
  twoFactorRequired: boolean;
  challengeToken: string;
  csrfToken: string;
}

// Password login. The session itself is the httpOnly cookie the gateway sets on
// this response; all that is kept here is a marker so the route guard can bounce
// an anonymous visitor without a round trip. When 2FA is required no session
// exists yet, so nothing is marked and the challenge token goes to step two.
//
// `remember` is the "Keep me signed in on this device" checkbox: false asks
// for a browser-session cookie. It is sent on both steps because the gateway
// keeps nothing between them.
export async function login(
  identifier: string,
  password: string,
  remember: boolean,
): Promise<{ twoFactorRequired: boolean; challengeToken: string }> {
  const r = await httpPost<LoginResponse>("/api/auth/login", { identifier, password, remember });
  if (!r.twoFactorRequired) {
    markAuthed();
    setCsrfToken(r.csrfToken);
  }
  return { twoFactorRequired: r.twoFactorRequired, challengeToken: r.challengeToken };
}

// Step two: exchange the TOTP/recovery code + challenge for a session. The
// response body still carries a token for non-browser clients; this one ignores
// it and rides the cookie the same response set.
export async function verifyTwoFactor(
  challengeToken: string,
  code: string,
  remember: boolean,
): Promise<void> {
  const r = await httpPost<{ token: string; csrfToken: string }>(
    "/api/auth/login/2fa",
    { challengeToken, code, remember },
  );
  markAuthed();
  setCsrfToken(r.csrfToken);
}

// Best-effort server logout — which is what actually revokes the session and
// clears the cookie — then always drop the local marker.
export async function logout(): Promise<void> {
  try {
    await httpPost<void>("/api/auth/logout");
  } catch {
    // ignore — clearing the marker is what matters
  }
  clearAuthed();
  clearCsrfToken();
}

export async function getMe(): Promise<Principal> {
  const d = await httpGet<AuthUserDto>("/api/auth/me");
  // Seeds the in-memory CSRF token on the normal path, since this response
  // already carries it. It is not what guarantees a token is there: nothing
  // awaits meQuery — the route guard is synchronous and the layout renders its
  // children while this is still in flight — so a mutation can beat it. That
  // case is handled by ensureCsrfToken, which fetches one when a mutation finds
  // none. This just saves the extra round trip when the ordering works out.
  if (d.csrfToken) setCsrfToken(d.csrfToken);
  return toPrincipal(d);
}
