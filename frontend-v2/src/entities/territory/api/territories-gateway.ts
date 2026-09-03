import { httpDelete, httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Territory } from "../model/territory";
import { toTerritory } from "./to-territory";

type TerritoryDto = components["schemas"]["Territory"];

export const listTerritories = async (): Promise<Territory[]> =>
  (await httpGet<TerritoryDto[]>("/api/territories")).map(toTerritory);

export const deleteTerritory = (slug: string): Promise<void> =>
  httpDelete(`/api/territories/${encodeURIComponent(slug)}`);
