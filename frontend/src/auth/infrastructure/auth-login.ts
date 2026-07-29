import { httpPost } from "@/shared/infrastructure/http/client";
import { markAuthed, clearAuthed } from "@/auth/infrastructure/session-marker";

interface LoginResponse {
  token: string;
  twoFactorRequired: boolean;
  challengeToken: string;
}

// Password login. The session itself is the httpOnly cookie the gateway sets on
// this response; all that is kept here is a marker so the route guard can bounce
// an anonymous visitor without a round trip. When 2FA is required no session
// exists yet, so nothing is marked and the challenge token goes to step two.
export async function login(
  identifier: string,
  password: string,
): Promise<{ twoFactorRequired: boolean; challengeToken: string }> {
  const r = await httpPost<LoginResponse>("/api/auth/login", { identifier, password });
  if (!r.twoFactorRequired) markAuthed();
  return { twoFactorRequired: r.twoFactorRequired, challengeToken: r.challengeToken };
}

// Step two: exchange the TOTP/recovery code + challenge for a session. The
// response body still carries a token for non-browser clients; this one ignores
// it and rides the cookie the same response set.
export async function verifyTwoFactor(challengeToken: string, code: string): Promise<void> {
  await httpPost<{ token: string }>("/api/auth/login/2fa", { challengeToken, code });
  markAuthed();
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
}
