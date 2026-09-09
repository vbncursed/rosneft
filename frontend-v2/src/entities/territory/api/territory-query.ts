import { queryOptions } from "@tanstack/react-query";
import { getTerritory } from "./territories-gateway";

export const territoryQuery = (slug: string) =>
  queryOptions({ queryKey: ["territory", slug], queryFn: () => getTerritory(slug) });
