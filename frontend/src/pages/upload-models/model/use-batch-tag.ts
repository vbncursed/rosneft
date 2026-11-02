import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { modelTagsQuery, type ModelTag } from "@/entities/model-tag";
import { unanswered } from "@/shared/lib/unanswered";

const TAGS_ERROR = "Tags could not be loaded. Try again.";

export type BatchTag = {
  /** The tag list; `undefined` while it loads or after it failed. */
  tags: ModelTag[] | undefined;
  /** The one tag every model of the batch gets; `null` until the reader picks. */
  tagSlug: string | null;
  onTag: (slug: string) => void;
  tagsError: string | null;
};

/** The batch's single tag choice and the state of the list it is chosen from. */
export function useBatchTag(): BatchTag {
  const tags = useQuery(modelTagsQuery());
  const [tagSlug, onTag] = useState<string | null>(null);
  return { tags: tags.data, tagSlug, onTag, tagsError: unanswered(tags) ? TAGS_ERROR : null };
}
