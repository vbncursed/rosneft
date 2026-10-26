import type * as Dto from "@/shared/api/dto";
import type { ModelTag } from "../model/model-tag";

export const toModelTag = (d: Dto.ModelTag): ModelTag => ({ slug: d.slug, title: d.title });
