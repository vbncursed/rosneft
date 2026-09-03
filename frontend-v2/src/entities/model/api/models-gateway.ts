import { httpDelete, httpGet } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import type { Model } from "../model/model";
import { toModel } from "./to-model";

type ModelDto = components["schemas"]["Model"];

export const listModels = async (): Promise<Model[]> =>
  (await httpGet<ModelDto[]>("/api/models")).map(toModel);

// The gateway answers 400 when placements still reference the model; the
// message names them and reaches the operator as a toast.
export const deleteModel = (slug: string): Promise<void> =>
  httpDelete(`/api/models/${encodeURIComponent(slug)}`);
