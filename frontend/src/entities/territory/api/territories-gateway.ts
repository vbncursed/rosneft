import { httpDelete, httpGet, httpGetBlob, httpPatch, httpPost } from "@/shared/api";
import type * as Dto from "@/shared/api/dto";
import type { Territory } from "../model/territory";
import { toTerritory } from "./to-territory";

type TerritoryDto = Dto.Territory;
type TerritoryCreatedDto = Dto.TerritoryCreated;
type TerritorySourceReplace = Dto.TerritorySourceReplace;
type TerritoryUpdate = Dto.TerritoryUpdate;

export const listTerritories = async (): Promise<Territory[]> =>
  (await httpGet<TerritoryDto[]>("/api/territories")).map(toTerritory);

export const getTerritory = async (slug: string): Promise<Territory> =>
  toTerritory(await httpGet<TerritoryDto>(`/api/territories/${encodeURIComponent(slug)}`));

/** Swaps the source archive; the territory keeps its slug and placements, and a new conversion job starts. */
export async function replaceTerritorySource(
  slug: string,
  sourceBlobHash: string,
): Promise<{ territory: Territory; job: { id: string } }> {
  const body: TerritorySourceReplace = { sourceBlobHash };
  const r = await httpPost<TerritoryCreatedDto>(`/api/territories/${encodeURIComponent(slug)}/source`, body);
  return { territory: toTerritory(r.territory), job: { id: r.job.id } };
}

export const deleteTerritory = (slug: string): Promise<void> =>
  httpDelete(`/api/territories/${encodeURIComponent(slug)}`);

export type ExportVariant = "compressed" | "compatible";

/** The whole scene as one GLB. Goes through the client so it shares the base URL and the 401 bounce. */
export const exportTerritoryGlb = (slug: string, variant: ExportVariant = "compressed"): Promise<Blob> =>
  httpGetBlob(
    `/api/territories/${encodeURIComponent(slug)}/export.glb${variant === "compatible" ? "?variant=compatible" : ""}`,
  );

/** Updates mutable fields only (no re-conversion) — today just the external panorama link. */
export const updateTerritory = async (slug: string, body: TerritoryUpdate): Promise<Territory> =>
  toTerritory(await httpPatch<TerritoryDto>(`/api/territories/${encodeURIComponent(slug)}`, body));

// The gateway's body for both POST /api/territories and POST /api/models;
// `thumbnailBlobHash` is ignored for territories, but typing against the real
// DTO (rather than a hand-duplicated shape) is what keeps this from drifting.
export type CreateTerritoryInput = Dto.EntityCreate;

/** Registers a territory from a finalized upload and queues its conversion. */
export async function createTerritory(
  input: CreateTerritoryInput,
): Promise<{ territory: Territory; job: { id: string } }> {
  const r = await httpPost<TerritoryCreatedDto>("/api/territories", input);
  return { territory: toTerritory(r.territory), job: { id: r.job.id } };
}
