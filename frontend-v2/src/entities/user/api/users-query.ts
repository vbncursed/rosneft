import { queryOptions } from "@tanstack/react-query";
import { listUsers } from "./users-gateway";

/** The people list, one cache entry; every mutation invalidates this key. */
export const usersQuery = queryOptions({ queryKey: ["users"], queryFn: listUsers });
