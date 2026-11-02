import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LIST_KEY } from "@/entities/conversion";
import { createModelTag, modelTagsQuery, renameModelTag } from "@/entities/model-tag";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";

/** Null when the write went through, otherwise the refusal to show beside the form. */
export type Outcome = string | null;

/**
 * The tag list and its two writes. A tag's title is printed on model cards,
 * model pages and in every scene bundle (the zone panel, the picker), so a
 * write marks the tag list, the model lists, each model and every bundle stale:
 * the screens on show re-read, the rest read again on their next mount.
 */
export function useModelTagsAdmin() {
  const client = useQueryClient();
  const tags = useQuery(modelTagsQuery()).data;

  const settle = async (write: () => Promise<unknown>, done: string): Promise<Outcome> => {
    try {
      await write();
    } catch (err) {
      return messageOf(err);
    }
    await Promise.all(
      [["model-tags"], [LIST_KEY.model], ["model"], ["scene"]].map((queryKey) =>
        client.invalidateQueries({ queryKey }),
      ),
    );
    notify.success(done);
    return null;
  };

  return {
    tags,
    create: (input: { slug: string; title: string }) =>
      settle(() => createModelTag({ slug: input.slug, title: input.title.trim() }), "Tag added"),
    rename: (slug: string, title: string) => settle(() => renameModelTag(slug, { title: title.trim() }), "Tag renamed"),
  };
}
