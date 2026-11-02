import type * as Dto from "@/shared/api/dto";
import { UNGROUPED_TAG_SLUG, type ModelTag } from "../model/model-tag";

// Read side only: a desktop snapshot saved before tags existed has no `tag`, so it reads as ungrouped.
export const toModelTag = (d?: Dto.ModelTag): ModelTag =>
  d ? { slug: d.slug, title: d.title } : { slug: UNGROUPED_TAG_SLUG, title: "Ungrouped" };
