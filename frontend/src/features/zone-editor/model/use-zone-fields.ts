import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { modelTagsQuery, UNGROUPED_TAG_SLUG } from "@/entities/model-tag";
import { unanswered } from "@/shared/lib/unanswered";

export const MAX_ZONE_TAGS = 5;
const TAGS_ERROR = "Tags could not be loaded. Try again.";

export type ZoneForm = { title: string; tagSlugs: string[] };

/** The fields a zone's form shares, new or edited: a title, one to five tags (never `ungrouped`) and the server's verdict on the title. */
export function useZoneFields(initial: ZoneForm) {
  const tagQuery = useQuery(modelTagsQuery());
  const [title, setTitleState] = useState(initial.title);
  const [selected, setSelected] = useState<string[]>(initial.tagSlugs);
  const [error, setError] = useState<string | null>(null);

  const tags = tagQuery.data?.filter((t) => t.slug !== UNGROUPED_TAG_SLUG);
  const atLimit = selected.length >= MAX_ZONE_TAGS;

  return {
    title,
    setTitle: (t: string) => {
      setTitleState(t);
      setError(null);
    },
    trimmed: title.trim(),
    tags,
    tagsError: unanswered(tagQuery) ? TAGS_ERROR : null,
    retryTags: () => void tagQuery.refetch(),
    selected,
    atLimit,
    toggleTag: (slug: string) =>
      setSelected((now) => (now.includes(slug) ? now.filter((s) => s !== slug) : atLimit ? now : [...now, slug])),
    error,
    setError,
    reset: () => {
      setTitleState(initial.title);
      setSelected(initial.tagSlugs);
    },
  };
}
