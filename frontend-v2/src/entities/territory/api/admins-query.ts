import { queryOptions } from "@tanstack/react-query";
import { getTerritoryAdmins } from "./admins-gateway";

export const adminsQuery = (slug: string) =>
  queryOptions({ queryKey: ["territory-admins", slug], queryFn: () => getTerritoryAdmins(slug) });
