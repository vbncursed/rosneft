import { httpDelete, httpGet, httpPatch, httpPost } from "@/shared/api";
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

export type ExportVariant = "compressed" | "compatible" | "obj";

// The download routes differ in shape: `?variant=compressed` is a 400 on export.glb, so compressed carries no query.
const EXPORT_PATH: Record<ExportVariant, string> = {
  compressed: "export.glb",
  compatible: "export.glb?variant=compatible",
  obj: "export.obj.zip",
};

/** Where the browser fetches the file itself; same origin, so the session cookie rides along. */
export const exportDownloadUrl = (slug: string, variant: ExportVariant): string =>
  `${import.meta.env.VITE_API_URL}/api/territories/${encodeURIComponent(slug)}/${EXPORT_PATH[variant]}`;

/** Runs the download's own checks without sending the file: its name and size, or the refusal the download would give. */
export const checkExport = (slug: string, variant: ExportVariant): Promise<Dto.ExportCheck> =>
  httpGet<Dto.ExportCheck>(`/api/territories/${encodeURIComponent(slug)}/export-check?variant=${variant}`);

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
