import { httpDelete, httpGet, httpPatch, httpPost } from "@/shared/api";
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

/** Title plus, optionally, the permission set, applied in one transaction; an omitted set is left alone. */
export const updateRole = async (
  slug: string,
  patch: { title: string; permissionSlugs?: string[] },
): Promise<Role> => toRole(await httpPatch<AuthRoleDto>(at(slug), patch));

export const deleteRole = (slug: string): Promise<void> => httpDelete(at(slug));
