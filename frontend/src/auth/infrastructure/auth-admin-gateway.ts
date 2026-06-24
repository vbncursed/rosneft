import { httpGet, httpPost, httpPatch, httpPut, httpDelete } from "@/shared/infrastructure/http/client";
import type { components } from "@/shared/infrastructure/api/dto";
import type { AdminUser } from "@/auth/domain/user";
import type { Role } from "@/auth/domain/role";
import type { Permission } from "@/auth/domain/permission";
import { mapPrincipal } from "@/auth/infrastructure/auth-gateway";

type AuthUserDto = components["schemas"]["AuthUser"];
type RoleDto = components["schemas"]["AuthRole"];
type PermDto = components["schemas"]["AuthPermission"];

function mapRole(d: RoleDto): Role {
  return {
    slug: d.slug ?? "",
    title: d.title ?? "",
    isSystem: d.isSystem ?? false,
    permissionSlugs: d.permissionSlugs ?? [],
  };
}

export async function listUsers(status: string, includeDeleted: boolean): Promise<AdminUser[]> {
  const q = new URLSearchParams();
  if (status) q.set("status", status);
  if (includeDeleted) q.set("includeDeleted", "true");
  const qs = q.toString();
  const data = await httpGet<AuthUserDto[]>(`/api/auth/users${qs ? `?${qs}` : ""}`);
  return data.map(mapPrincipal);
}

export async function createUser(email: string, username: string, password: string, roleSlugs: string[]): Promise<AdminUser> {
  return mapPrincipal(await httpPost("/api/auth/users", { email, username, password, roleSlugs }));
}

export async function updateUserRoles(id: string, roleSlugs: string[]): Promise<AdminUser> {
  return mapPrincipal(await httpPatch(`/api/auth/users/${encodeURIComponent(id)}`, { roleSlugs }));
}

export async function freezeUser(id: string): Promise<AdminUser> {
  return mapPrincipal(await httpPost(`/api/auth/users/${encodeURIComponent(id)}/freeze`));
}
export async function unfreezeUser(id: string): Promise<AdminUser> {
  return mapPrincipal(await httpPost(`/api/auth/users/${encodeURIComponent(id)}/unfreeze`));
}
export function deleteUser(id: string): Promise<void> {
  return httpDelete(`/api/auth/users/${encodeURIComponent(id)}`);
}
export async function restoreUser(id: string): Promise<AdminUser> {
  return mapPrincipal(await httpPost(`/api/auth/users/${encodeURIComponent(id)}/restore`));
}
export async function setUserOwner(id: string, isOwner: boolean): Promise<AdminUser> {
  return mapPrincipal(await httpPost(`/api/auth/users/${encodeURIComponent(id)}/owner`, { isOwner }));
}

export async function listRoles(): Promise<Role[]> {
  return (await httpGet<RoleDto[]>("/api/auth/roles")).map(mapRole);
}
export async function createRole(slug: string, title: string, permissionSlugs: string[]): Promise<Role> {
  return mapRole(await httpPost("/api/auth/roles", { slug, title, permissionSlugs }));
}
export async function renameRole(slug: string, title: string): Promise<Role> {
  return mapRole(await httpPatch(`/api/auth/roles/${encodeURIComponent(slug)}`, { title }));
}
export function deleteRole(slug: string): Promise<void> {
  return httpDelete(`/api/auth/roles/${encodeURIComponent(slug)}`);
}
export async function setRolePermissions(slug: string, permissionSlugs: string[]): Promise<Role> {
  return mapRole(await httpPut(`/api/auth/roles/${encodeURIComponent(slug)}/permissions`, { permissionSlugs }));
}
export async function listPermissions(): Promise<Permission[]> {
  const data = await httpGet<PermDto[]>("/api/auth/permissions");
  return data.map((d) => ({ slug: d.slug ?? "", description: d.description ?? "" }));
}
