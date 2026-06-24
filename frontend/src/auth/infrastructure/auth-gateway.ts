import { httpGet, httpPost } from "@/shared/infrastructure/http/client";
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
  };
}

export async function getMe(): Promise<Principal> {
  return mapPrincipal(await httpGet<AuthUserDto>("/api/auth/me"));
}

export function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  return httpPost<void>("/api/auth/me/password", { oldPassword, newPassword });
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
