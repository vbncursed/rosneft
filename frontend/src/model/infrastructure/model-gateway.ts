import { httpDelete, httpGet, httpPost } from "@/shared/infrastructure/http/client";
import type { components } from "@/shared/infrastructure/api/dto";
import type { Model } from "@/model/domain/model";
import type { Job } from "@/shared/domain/job";

type ModelDto = components["schemas"]["Model"];
type ModelCreatedDto = components["schemas"]["ModelCreated"];
type EntityCreate = components["schemas"]["EntityCreate"];
type JobDto = components["schemas"]["Job"];

function mapModel(d: ModelDto): Model {
  return {
    slug: d.slug,
    title: d.title,
    description: d.description,
    sourceBlobHash: d.sourceBlobHash,
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

export async function deleteModel(slug: string): Promise<void> {
  return httpDelete(`/api/models/${encodeURIComponent(slug)}`);
}
