import { httpPatch, httpPost } from "@/shared/api";
import type * as Dto from "@/shared/api/dto";
import type { ModelTag } from "../model/model-tag";
import { toModelTag } from "./to-model-tag";

/** `model:write`. A duplicate slug or title, or the `ungrouped` tag, answers 400. */
export const createModelTag = async (input: Dto.ModelTagCreate): Promise<ModelTag> =>
  toModelTag(await httpPost<Dto.ModelTag>("/api/model-tags", input));

/** `model:write`. Only the title changes; a tag is never deleted. */
export const renameModelTag = async (slug: string, patch: Dto.ModelTagUpdate): Promise<ModelTag> =>
  toModelTag(await httpPatch<Dto.ModelTag>(`/api/model-tags/${encodeURIComponent(slug)}`, patch));
