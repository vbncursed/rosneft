import type { components } from "@/shared/api/dto";
import type { Role } from "../model/role";

type AuthRoleDto = components["schemas"]["AuthRole"];

// `users` is null here on purpose: the contract has no role→people count, so
// the Roles screen derives it from the people list when it may read one. A
// system role is defined by migrations, which is what "immutable" says.
// permissionSlugs defends against the gateway's null the same way
// to-user.ts's roleSlugs does — a Go nil slice marshals to JSON null.
export function toRole(d: AuthRoleDto): Role {
  const permissionSlugs = d.permissionSlugs ?? [];
  const kind = d.isSystem ? "system" : "custom";
  return {
    slug: d.slug ?? "",
    title: d.title ?? "",
    kind,
    permissionSlugs,
    grants: permissionSlugs.length,
    users: null,
    updated: kind === "system" ? "immutable" : "",
  };
}
