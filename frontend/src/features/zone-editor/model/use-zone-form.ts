import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { modelTagsQuery, UNGROUPED_TAG_SLUG } from "@/entities/model-tag";
import { HttpError } from "@/shared/api";
import { notify } from "@/shared/lib/notify";
import { unanswered } from "@/shared/lib/unanswered";

export const MAX_ZONE_TAGS = 5;
const TAGS_ERROR = "Tags could not be loaded. Try again.";

export type ZoneForm = { title: string; tagSlugs: string[] };

/** The zone form: a title, one to five tags (never `ungrouped`) and the server's verdict on them. */
export function useZoneForm({
  canPlace,
  onCreate,
}: {
  canPlace: boolean;
  onCreate: (form: ZoneForm) => Promise<void>;
}) {
  const tagQuery = useQuery(modelTagsQuery());
  const [title, setTitleState] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tags = tagQuery.data?.filter((t) => t.slug !== UNGROUPED_TAG_SLUG);
  const atLimit = selected.length >= MAX_ZONE_TAGS;
  const trimmed = title.trim();

  async function submit() {
    setBusy(true);
    try {
      await onCreate({ title: trimmed, tagSlugs: selected });
      setTitleState("");
      setSelected([]);
    } catch (err) {
      // A refusal (a title already taken) belongs under the field; an outage does not.
      if (err instanceof HttpError && err.status < 500) setError(err.message);
      else notify.error("Could not create the zone. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return {
    title,
    setTitle: (t: string) => {
      setTitleState(t);
      setError(null);
    },
    tags,
    tagsError: unanswered(tagQuery) ? TAGS_ERROR : null,
    retryTags: () => void tagQuery.refetch(),
    selected,
    atLimit,
    toggleTag: (slug: string) =>
      setSelected((now) => (now.includes(slug) ? now.filter((s) => s !== slug) : atLimit ? now : [...now, slug])),
    error,
    busy,
    canCreate: canPlace && !busy && tags !== undefined && trimmed.length > 0 && selected.length > 0,
    submit,
  };
}
