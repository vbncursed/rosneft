import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { modelTagsQuery, UNGROUPED_TAG_SLUG, type ModelTag } from "@/entities/model-tag";
import { HttpError } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";

export const MAX_ZONE_TAGS = 5;
const TAGS_ERROR = "Tags could not be loaded. Try again.";

export type ZoneForm = { title: string; tagSlugs: string[] };

/** The fields a zone's form shares, new or edited: a title, one to five tags (never `ungrouped`) and the server's verdict on the title. */
export function useZoneFields(initial: ZoneForm, suggested = false, canonical: ModelTag[] = []) {
  const tagQuery = useQuery(modelTagsQuery());
  const [titleState, setTitleState] = useState<string | null>(null);
  const title = titleState ?? initial.title;
  const [selectedState, setSelected] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tags = tagQuery.data
    ? [...tagQuery.data, ...canonical.filter((tag) => !tagQuery.data?.some((item) => item.slug === tag.slug))].filter(
        (tag) => tag.slug !== UNGROUPED_TAG_SLUG,
      )
    : undefined;
  const [previousTags, setPreviousTags] = useState(tagQuery.data);
  if (tagQuery.data !== previousTags) {
    setPreviousTags(tagQuery.data);
    if (tagQuery.data && selectedState) {
      setSelected(selectedState.filter((slug) => tags?.some((tag) => tag.slug === slug)));
    }
  }
  const rawSelected = selectedState ?? initial.tagSlugs;
  const selected = tags
    ? rawSelected.filter((slug) => tags.some((tag) => tag.slug === slug)).slice(0, MAX_ZONE_TAGS)
    : suggested
      ? []
      : rawSelected;
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
      setSelected(
        selected.includes(slug) ? selected.filter((s) => s !== slug) : atLimit ? selected : [...selected, slug],
      ),
    error,
    setError,
    /** The one rule for a failed save: only a refusal about the Title sits under the field; any other 4xx speaks in a toast, an outage in the fallback. */
    reject: (err: unknown, fallback: string) => {
      if (err instanceof HttpError && err.status === 400 && /title/iu.test(err.message)) setError(err.message);
      else if (err instanceof HttpError && err.status < 500) notify.error(err.message);
      else notify.error(fallback);
    },
    reset: () => {
      setTitleState(initial.title);
      setSelected(initial.tagSlugs);
    },
  };
}
