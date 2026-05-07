import { httpGet, httpPost } from "@/shared/infrastructure/http/client";
import type { components } from "@/shared/infrastructure/api/dto";
import type { Project } from "@/catalog/domain/project";
import type { Artifact } from "@/catalog/domain/artifact";
import type { Job } from "@/catalog/domain/job";
import type { LodArtifact } from "@/catalog/domain/lod-artifact";
import type { SceneBundle } from "@/catalog/domain/scene-bundle";
import type { Placement } from "@/placement/domain/placement";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";

type ProjectDto = components["schemas"]["Project"];
type ArtifactDto = components["schemas"]["Artifact"];
type JobDto = components["schemas"]["Job"];
type PlacementDto = components["schemas"]["Placement"];
type AssetOptionDto = components["schemas"]["AssetOption"];
type SceneBundleDto = components["schemas"]["SceneBundle"];
type LodArtifactDto = components["schemas"]["LodArtifact"];

function mapProject(d: ProjectDto): Project {
  return {
    slug: d.slug,
    title: d.title,
    subtitle: d.subtitle,
    description: d.description,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function mapLodArtifact(d: LodArtifactDto): LodArtifact {
  return {
    lod: d.lod,
    hash: d.hash,
    size: d.size,
    vertices: d.vertices,
    faces: d.faces,
  };
}

function mapArtifact(d: ArtifactDto): Artifact {
  return {
    projectSlug: d.projectSlug,
    lod: d.lod,
    hash: d.hash,
    contentType: d.contentType,
    size: d.size,
    vertices: d.vertices,
    faces: d.faces,
    bboxMin: d.bboxMin,
    bboxMax: d.bboxMax,
    createdAt: d.createdAt,
    lods: d.artifacts ? d.artifacts.map(mapLodArtifact) : undefined,
  };
}

function mapJob(d: JobDto): Job {
  return {
    id: d.id,
    projectSlug: d.projectSlug,
    status: d.status,
    errorMessage: d.errorMessage,
    artifactHash: d.artifactHash,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

function mapPlacement(d: PlacementDto): Placement {
  return {
    id: d.id,
    parentSlug: d.parentSlug,
    assetSlug: d.assetSlug,
    position: d.position,
    rotation: d.rotation,
    scale: d.scale,
    label: d.label ?? "",
    updatedAt: d.updatedAt ?? "",
  };
}

function mapAssetOption(d: AssetOptionDto): PlacementAssetOption {
  return {
    slug: d.slug,
    title: d.title,
    lods: d.artifacts.map(mapLodArtifact),
  };
}

export async function listProjects(): Promise<Project[]> {
  const data = await httpGet<ProjectDto[]>("/api/projects");
  return data.map(mapProject);
}

export async function getProject(slug: string): Promise<Project> {
  const data = await httpGet<ProjectDto>(`/api/projects/${encodeURIComponent(slug)}`);
  return mapProject(data);
}

export async function getArtifact(slug: string, lod: number): Promise<Artifact> {
  const data = await httpGet<ArtifactDto>(
    `/api/projects/${encodeURIComponent(slug)}/artifacts/${lod}`,
  );
  return mapArtifact(data);
}

// getSceneBundle replaces the four parallel calls + N-by-asset getArtifact
// dance the viewer used to do. Single HTTP round-trip; gateway parallelises
// internally via errgroup.
export async function getSceneBundle(slug: string): Promise<SceneBundle> {
  const data = await httpGet<SceneBundleDto>(
    `/api/projects/${encodeURIComponent(slug)}/scene`,
  );
  return {
    project: mapProject(data.project),
    artifact: data.artifact ? mapArtifact(data.artifact) : null,
    placements: data.placements.map(mapPlacement),
    assetOptions: data.assetOptions.map(mapAssetOption),
  };
}

export async function submitConversion(slug: string): Promise<Job> {
  const data = await httpPost<JobDto>(
    `/api/projects/${encodeURIComponent(slug)}/convert`,
  );
  return mapJob(data);
}

export async function getJob(id: string): Promise<Job> {
  const data = await httpGet<JobDto>(`/api/jobs/${encodeURIComponent(id)}`);
  return mapJob(data);
}
