import { httpDelete, httpGet, httpPost } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Territory } from "../model/territory";
import { toTerritory } from "./to-territory";

type TerritoryDto = components["schemas"]["Territory"];
type TerritoryCreatedDto = components["schemas"]["TerritoryCreated"];

export const listTerritories = async (): Promise<Territory[]> =>
  (await httpGet<TerritoryDto[]>("/api/territories")).map(toTerritory);

export const deleteTerritory = (slug: string): Promise<void> =>
  httpDelete(`/api/territories/${encodeURIComponent(slug)}`);

export type CreateTerritoryInput = {
  title: string;
  description?: string;
  externalPanoramaUrl?: string;
  sourceBlobHash: string;
};

/** Registers a territory from a finalized upload and queues its conversion. */
export async function createTerritory(
  input: CreateTerritoryInput,
): Promise<{ territory: Territory; job: { id: string } }> {
  const r = await httpPost<TerritoryCreatedDto>("/api/territories", input);
  return { territory: toTerritory(r.territory), job: { id: r.job.id } };
}
