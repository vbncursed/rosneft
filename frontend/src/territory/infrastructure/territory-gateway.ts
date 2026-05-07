import { httpDelete, httpGet, httpPost } from "@/shared/infrastructure/http/client";
import type { components } from "@/shared/infrastructure/api/dto";
import type { Territory } from "@/territory/domain/territory";
import type { SceneBundle } from "@/territory/domain/scene-bundle";
import type { Artifact } from "@/shared/domain/artifact";
import type { Job } from "@/shared/domain/job";
import type { LodArtifact } from "@/shared/domain/lod-artifact";
import type { Placement } from "@/placement/domain/placement";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";

type TerritoryDto = components["schemas"]["Territory"];
type ArtifactDto = components["schemas"]["Artifact"];
type LodArtifactDto = components["schemas"]["LodArtifact"];
type SceneBundleDto = components["schemas"]["SceneBundle"];
type TerritoryCreatedDto = components["schemas"]["TerritoryCreated"];
type PlacementDto = components["schemas"]["Placement"];
type AssetOptionDto = components["schemas"]["AssetOption"];
type EntityCreate = components["schemas"]["EntityCreate"];
type JobDto = components["schemas"]["Job"];

function mapTerritory(d: TerritoryDto): Territory {
  return {
    slug: d.slug,
    title: d.title,
    description: d.description,
    sourceBlobHash: d.sourceBlobHash,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function mapLod(d: LodArtifactDto): LodArtifact {
  return { lod: d.lod, hash: d.hash, size: d.size, vertices: d.vertices, faces: d.faces };
}

function mapArtifact(d: ArtifactDto): Artifact {
  return {
    slug: d.slug,
    lod: d.lod,
    hash: d.hash,
    contentType: d.contentType,
    size: d.size,
    vertices: d.vertices,
    faces: d.faces,
    bboxMin: d.bboxMin,
    bboxMax: d.bboxMax,
    createdAt: d.createdAt,
    lods: d.artifacts ? d.artifacts.map(mapLod) : undefined,
  };
}

function mapPlacement(d: PlacementDto): Placement {
  return {
    id: d.id,
    territorySlug: d.territorySlug,
    modelSlug: d.modelSlug,
    position: d.position,
    rotation: d.rotation,
    scale: d.scale,
    label: d.label ?? "",
    updatedAt: d.updatedAt ?? "",
  };
}

function mapAssetOption(d: AssetOptionDto): PlacementAssetOption {
  return { slug: d.slug, title: d.title, lods: d.artifacts.map(mapLod) };
}

function mapJob(d: JobDto): Job {
  return {
    id: d.id,
    kind: d.kind,
    slug: d.slug,
    status: d.status,
    errorMessage: d.errorMessage,
    artifactHash: d.artifactHash,
    progress: d.progress,
    stage: d.stage,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export async function listTerritories(): Promise<Territory[]> {
  const data = await httpGet<TerritoryDto[]>("/api/territories");
  return data.map(mapTerritory);
}

export async function getTerritory(slug: string): Promise<Territory> {
  const data = await httpGet<TerritoryDto>(`/api/territories/${encodeURIComponent(slug)}`);
  return mapTerritory(data);
}

export async function createTerritory(
  body: EntityCreate,
): Promise<{ territory: Territory; job: Job }> {
  const data = await httpPost<TerritoryCreatedDto>("/api/territories", body);
  return { territory: mapTerritory(data.territory), job: mapJob(data.job) };
}

export async function deleteTerritory(slug: string): Promise<void> {
  return httpDelete(`/api/territories/${encodeURIComponent(slug)}`);
}

export async function getSceneBundle(slug: string): Promise<SceneBundle> {
  const data = await httpGet<SceneBundleDto>(
    `/api/territories/${encodeURIComponent(slug)}/scene`,
  );
  return {
    territory: mapTerritory(data.territory),
    artifact: data.artifact ? mapArtifact(data.artifact) : null,
    placements: data.placements.map(mapPlacement),
    modelOptions: data.modelOptions.map(mapAssetOption),
  };
}
