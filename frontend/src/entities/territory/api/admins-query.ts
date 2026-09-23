import { queryOptions } from "@tanstack/react-query";
import { listTerritoryAdmins } from "./admins-gateway";

/** One cache entry for every territory's admin set. */
export const territoryAdminsQuery = queryOptions({
  queryKey: ["territory-admins"],
  queryFn: listTerritoryAdmins,
});
