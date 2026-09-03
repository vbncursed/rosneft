import { queryOptions } from "@tanstack/react-query";
import { listPermissions } from "./permissions-gateway";

/** The permission catalog, one cache entry — it rarely changes. */
export const permissionsQuery = queryOptions({ queryKey: ["permissions"], queryFn: listPermissions });
