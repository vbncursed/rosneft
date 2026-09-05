import { httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Permission } from "../model/permission";

type AuthPermissionDto = components["schemas"]["AuthPermission"];

// An empty description is "none", which the model spells as absent.
export const listPermissions = async (): Promise<Permission[]> =>
  (await httpGet<AuthPermissionDto[]>("/api/auth/permissions")).map((d) => ({
    slug: d.slug ?? "",
    ...(d.description ? { description: d.description } : {}),
  }));
