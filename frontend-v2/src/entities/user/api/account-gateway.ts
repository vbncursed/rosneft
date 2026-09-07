import { httpGet, httpPost } from "@/shared/api";

/** What the account screen shows about 2FA. `enabledAt` is null when unknown. */
export type TwoFactorStatus = {
  enabled: boolean;
  enabledAt: string | null;
  recoveryRemaining: number;
  recoveryTotal: number;
};

export function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  // credentialed: a wrong current password answers this request, not the
  // session — a 401 here must surface as a toast, not sign the user out.
  return httpPost("/api/auth/me/password", { oldPassword, newPassword }, { credentialed: true });
}

export async function twoFactorStatus(): Promise<TwoFactorStatus> {
  const d = await httpGet<{
    enabled?: boolean;
    enabledAt?: string;
    recoveryRemaining?: number;
    recoveryTotal?: number;
  }>("/api/auth/2fa");
  return {
    enabled: d.enabled ?? false,
    // The server omits the key when it never recorded the moment. Null, not a
    // fabricated date: the card drops the line rather than print a guess.
    enabledAt: d.enabledAt ?? null,
    recoveryRemaining: d.recoveryRemaining ?? 0,
    recoveryTotal: d.recoveryTotal ?? 0,
  };
}

export async function setup2FA(): Promise<{ secret: string; otpauthUrl: string }> {
  const d = await httpPost<{ secret?: string; otpauthUrl?: string }>("/api/auth/2fa/setup");
  return { secret: d.secret ?? "", otpauthUrl: d.otpauthUrl ?? "" };
}

/** Confirms the pending secret. The recovery codes come back once, here. */
export async function enable2FA(code: string): Promise<string[]> {
  const d = await httpPost<{ recoveryCodes?: string[] }>("/api/auth/2fa/enable", { code });
  return d.recoveryCodes ?? [];
}

/** Takes a current authenticator code — not a recovery code, not the password. */
export function disable2FA(code: string): Promise<void> {
  return httpPost("/api/auth/2fa/disable", { code });
}

export async function regenerateRecoveryCodes(code: string): Promise<string[]> {
  const d = await httpPost<{ recoveryCodes?: string[] }>("/api/auth/2fa/recovery/regenerate", { code });
  return d.recoveryCodes ?? [];
}
