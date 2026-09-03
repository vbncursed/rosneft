import { queryOptions } from "@tanstack/react-query";
import { listTerritories } from "./territories-gateway";

export const territoriesQuery = queryOptions({ queryKey: ["territories"], queryFn: listTerritories });
