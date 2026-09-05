import { httpDelete, httpGet, httpPatch, httpPost } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Model } from "../model/model";
import { toModel } from "./to-model";

type ModelDto = components["schemas"]["Model"];
type ModelCreatedDto = components["schemas"]["ModelCreated"];

export const listModels = async (): Promise<Model[]> =>
  (await httpGet<ModelDto[]>("/api/models")).map(toModel);

// The gateway answers 400 when placements still reference the model; the
// message names them and reaches the operator as a toast.
export const deleteModel = (slug: string): Promise<void> =>
  httpDelete(`/api/models/${encodeURIComponent(slug)}`);

export type CreateModelInput = {
  title: string;
  description?: string;
  sourceBlobHash: string;
  thumbnailBlobHash?: string;
};

/** Registers a model from a finalized upload and queues its conversion. */
export async function createModel(
  input: CreateModelInput,
): Promise<{ model: Model; job: { id: string } }> {
  const r = await httpPost<ModelCreatedDto>("/api/models", input);
  return { model: toModel(r.model), job: { id: r.job.id } };
}

/** Attaches a picker thumbnail after the upload finalizes; empty clears it. */
export const setModelThumbnail = async (slug: string, thumbnailBlobHash: string): Promise<Model> =>
  toModel(
    await httpPatch<ModelDto>(
      `/api/models/${encodeURIComponent(slug)}`,
      { thumbnailBlobHash } satisfies components["schemas"]["ModelUpdate"],
    ),
  );
