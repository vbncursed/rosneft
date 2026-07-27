import { queryOptions } from "@tanstack/react-query";
import { listTerritories } from "@/territory/infrastructure/territory-gateway";

export const territoriesQuery = queryOptions({
  queryKey: ["territories"],
  queryFn: listTerritories,
});
