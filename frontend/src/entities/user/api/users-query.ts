import { queryOptions } from "@tanstack/react-query";
import { listUsers } from "./users-gateway";

/**
 * The people list, one cache entry. A delete, or a role edit in pages/roles
 * (a role's title rides on every holder), invalidates this key; every other
 * user write merges the gateway's answer in (`putUser`, pages/users).
 */
export const usersQuery = queryOptions({ queryKey: ["users"], queryFn: listUsers });
