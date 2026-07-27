import { httpPost } from "@/shared/infrastructure/http/client";
import { setToken, clearToken } from "@/auth/infrastructure/token-store";

interface LoginResponse {
  token: string;
  twoFactorRequired: boolean;
  challengeToken: string;
}

// Password login. On a non-2FA success the session token is stored; when 2FA is
// required nothing is stored and the challenge token is returned for step two.
export async function login(
  identifier: string,
  password: string,
): Promise<{ twoFactorRequired: boolean; challengeToken: string }> {
  const r = await httpPost<LoginResponse>("/api/auth/login", { identifier, password });
  if (!r.twoFactorRequired) setToken(r.token);
  return { twoFactorRequired: r.twoFactorRequired, challengeToken: r.challengeToken };
}

// Step two: exchange the TOTP/recovery code + challenge for a session token.
export async function verifyTwoFactor(challengeToken: string, code: string): Promise<void> {
  const r = await httpPost<{ token: string }>("/api/auth/login/2fa", { challengeToken, code });
  setToken(r.token);
}

// Best-effort server logout, then always drop the local token.
export async function logout(): Promise<void> {
  try {
    await httpPost<void>("/api/auth/logout");
  } catch {
    // ignore — clearing the local token is what matters
  }
  clearToken();
}
