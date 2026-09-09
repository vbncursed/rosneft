import { queryOptions } from "@tanstack/react-query";
import { listRoles } from "./roles-gateway";

/** The role list, one cache entry; every mutation invalidates this key. */
export const rolesQuery = queryOptions({ queryKey: ["roles"], queryFn: listRoles });
