import { httpDelete, httpGet, httpPatch, httpPost, httpPut } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Role } from "../model/role";
import { toRole } from "./to-role";

type AuthRoleDto = components["schemas"]["AuthRole"];

const at = (slug: string) => `/api/auth/roles/${encodeURIComponent(slug)}`;

export const listRoles = async (): Promise<Role[]> =>
  (await httpGet<AuthRoleDto[]>("/api/auth/roles")).map(toRole);

/** The gateway derives the slug from the title; nothing here invents one. */
export const createRole = async (title: string, permissionSlugs: string[]): Promise<Role> =>
  toRole(await httpPost<AuthRoleDto>("/api/auth/roles", { title, permissionSlugs }));

export const renameRole = async (slug: string, title: string): Promise<Role> =>
  toRole(await httpPatch<AuthRoleDto>(at(slug), { title }));

/** Replaces the whole set. */
export const setRolePermissions = async (slug: string, permissionSlugs: string[]): Promise<Role> =>
  toRole(await httpPut<AuthRoleDto>(`${at(slug)}/permissions`, { permissionSlugs }));

export const deleteRole = (slug: string): Promise<void> => httpDelete(at(slug));
