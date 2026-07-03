import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
} from "@/shared/infrastructure/http/client";
import type { components } from "@/shared/infrastructure/api/dto";
import type { Model } from "@/model/domain/model";
import type { Job } from "@/shared/domain/job";
import type { Artifact } from "@/shared/domain/artifact";
import type { LodArtifact } from "@/shared/domain/lod-artifact";

type ModelDto = components["schemas"]["Model"];
type ModelCreatedDto = components["schemas"]["ModelCreated"];
type EntityCreate = components["schemas"]["EntityCreate"];
type ModelUpdate = components["schemas"]["ModelUpdate"];
type JobDto = components["schemas"]["Job"];
type ArtifactDto = components["schemas"]["Artifact"];
type LodArtifactDto = components["schemas"]["LodArtifact"];

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

function mapModel(d: ModelDto): Model {
  return {
    slug: d.slug,
    title: d.title,
    description: d.description,
    sourceBlobHash: d.sourceBlobHash,
    thumbnailBlobHash: d.thumbnailBlobHash,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
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

export async function listModels(): Promise<Model[]> {
  const data = await httpGet<ModelDto[]>("/api/models");
  return data.map(mapModel);
}

export async function getModel(slug: string): Promise<Model> {
  const data = await httpGet<ModelDto>(`/api/models/${encodeURIComponent(slug)}`);
  return mapModel(data);
}

export async function createModel(
  body: EntityCreate,
): Promise<{ model: Model; job: Job }> {
  const data = await httpPost<ModelCreatedDto>("/api/models", body);
  return { model: mapModel(data.model), job: mapJob(data.job) };
}

// updateModelThumbnail sets (or clears, with "") the model's thumbnail image
// blob hash. The image must already be uploaded via the chunked-upload flow.
export async function updateModelThumbnail(
  slug: string,
  thumbnailBlobHash: string,
): Promise<Model> {
  const data = await httpPatch<ModelDto>(
    `/api/models/${encodeURIComponent(slug)}`,
    { thumbnailBlobHash } satisfies ModelUpdate,
  );
  return mapModel(data);
}

export async function deleteModel(slug: string): Promise<void> {
  return httpDelete(`/api/models/${encodeURIComponent(slug)}`);
}

export async function listModelArtifacts(slug: string): Promise<Artifact[]> {
  const data = await httpGet<ArtifactDto[]>(
    `/api/models/${encodeURIComponent(slug)}/artifacts`,
  );
  return data.map(mapArtifact);
}
