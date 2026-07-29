import { httpGet, httpPost } from "@/shared/infrastructure/http/client";
import { setCsrfToken } from "@/auth/infrastructure/csrf-token";
import type { components } from "@/shared/infrastructure/api/dto";
import type { Principal } from "@/auth/domain/principal";

type AuthUserDto = components["schemas"]["AuthUser"];

export function mapPrincipal(d: AuthUserDto): Principal {
  return {
    id: d.id ?? "",
    email: d.email ?? "",
    username: d.username ?? "",
    status: (d.status as Principal["status"]) ?? "active",
    totpEnabled: d.totpEnabled ?? false,
    roleSlugs: d.roleSlugs ?? [],
    permissions: d.permissions ?? [],
    isOwner: d.isOwner ?? false,
    onboardingToursSeen: d.onboardingToursSeen ?? [],
  };
}

export async function getMe(): Promise<Principal> {
  const d = await httpGet<AuthUserDto>("/api/auth/me");
  // The CSRF token lives in memory only, so a page reload starts without one and
  // the first mutation would 403. This is where it comes back: meQuery already
  // runs before anything can be rendered, let alone mutated.
  if (d.csrfToken) setCsrfToken(d.csrfToken);
  return mapPrincipal(d);
}

export function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  return httpPost<void>("/api/auth/me/password", { oldPassword, newPassword });
}

export function markTourSeen(tour: string): Promise<void> {
  return httpPost<void>(`/api/auth/me/onboarding/${encodeURIComponent(tour)}`);
}

export function setup2FA(): Promise<{ secret: string; otpauthUrl: string }> {
  return httpPost("/api/auth/2fa/setup");
}

export async function enable2FA(code: string): Promise<string[]> {
  const r = await httpPost<{ recoveryCodes?: string[] }>("/api/auth/2fa/enable", { code });
  return r.recoveryCodes ?? [];
}

export function disable2FA(code: string): Promise<void> {
  return httpPost<void>("/api/auth/2fa/disable", { code });
}

export async function regenerateRecoveryCodes(code: string): Promise<string[]> {
  const r = await httpPost<{ recoveryCodes?: string[] }>("/api/auth/2fa/recovery/regenerate", { code });
  return r.recoveryCodes ?? [];
}
