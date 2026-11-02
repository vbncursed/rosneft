import { httpDelete, httpGet, httpPatch, httpPost } from "@/shared/api";
import type * as Dto from "@/shared/api/dto";
import type { Model } from "../model/model";
import { toModel } from "./to-model";

type ModelDto = Dto.Model;
type ModelCreatedDto = Dto.ModelCreated;

export const listModels = async (): Promise<Model[]> => (await httpGet<ModelDto[]>("/api/models")).map(toModel);

export const getModel = async (slug: string): Promise<Model> =>
  toModel(await httpGet<ModelDto>(`/api/models/${encodeURIComponent(slug)}`));

export type ModelPatch = Dto.ModelUpdate;

/** Title, description, tag and thumbnail are mutable; a thumbnail of `""` removes it. */
export const updateModel = async (slug: string, patch: ModelPatch): Promise<Model> =>
  toModel(await httpPatch<ModelDto>(`/api/models/${encodeURIComponent(slug)}`, patch));

// The gateway answers 400 when placements still reference the model; the
// message names them and reaches the operator as a toast.
export const deleteModel = (slug: string): Promise<void> => httpDelete(`/api/models/${encodeURIComponent(slug)}`);

// Typing against the shared DTO rather than a hand-copied shape keeps client and gateway from drifting.
export type CreateModelInput = Dto.ModelCreate;

/** Registers a model from a finalized upload and queues its conversion. */
export async function createModel(input: CreateModelInput): Promise<{ model: Model; job: { id: string } }> {
  const r = await httpPost<ModelCreatedDto>("/api/models", input);
  return { model: toModel(r.model), job: { id: r.job.id } };
}
