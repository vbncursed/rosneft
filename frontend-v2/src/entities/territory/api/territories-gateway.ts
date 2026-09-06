import { httpDelete, httpGet, httpPost } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Territory } from "../model/territory";
import { toTerritory } from "./to-territory";

type TerritoryDto = components["schemas"]["Territory"];
type TerritoryCreatedDto = components["schemas"]["TerritoryCreated"];

export const listTerritories = async (): Promise<Territory[]> =>
  (await httpGet<TerritoryDto[]>("/api/territories")).map(toTerritory);

export const getTerritory = async (slug: string): Promise<Territory> =>
  toTerritory(await httpGet<TerritoryDto>(`/api/territories/${encodeURIComponent(slug)}`));

/** Swaps the source archive; the territory keeps its slug and placements, and a new conversion job starts. */
export async function replaceTerritorySource(
  slug: string,
  sourceBlobHash: string,
): Promise<{ territory: Territory; job: { id: string } }> {
  const r = await httpPost<TerritoryCreatedDto>(`/api/territories/${encodeURIComponent(slug)}/source`, {
    sourceBlobHash,
  });
  return { territory: toTerritory(r.territory), job: { id: r.job.id } };
}

export const deleteTerritory = (slug: string): Promise<void> =>
  httpDelete(`/api/territories/${encodeURIComponent(slug)}`);

// The gateway's body for both POST /api/territories and POST /api/models;
// `thumbnailBlobHash` is ignored for territories, but typing against the real
// DTO (rather than a hand-duplicated shape) is what keeps this from drifting.
export type CreateTerritoryInput = components["schemas"]["EntityCreate"];

/** Registers a territory from a finalized upload and queues its conversion. */
export async function createTerritory(
  input: CreateTerritoryInput,
): Promise<{ territory: Territory; job: { id: string } }> {
  const r = await httpPost<TerritoryCreatedDto>("/api/territories", input);
  return { territory: toTerritory(r.territory), job: { id: r.job.id } };
}
