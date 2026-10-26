import { SectionHeading } from "@/shared/ui/section-heading";
import { useModelTagsAdmin } from "../model/use-model-tags-admin";
import { TagAddForm } from "./tag-add-form";
import { TagRow } from "./tag-row";

/** The Root-only list of model tags: rename one, add one. There is no delete. */
export function ModelTagsCard() {
  const { tags, create, rename } = useModelTagsAdmin();

  return (
    <section aria-label="Tags" className="mt-8 flex flex-col gap-3">
      <SectionHeading title="Tags" count={tags ? `${tags.length} tags` : undefined} />
      <div className="rounded-[11px] border border-line bg-panel">
        {tags ? (
          <ul className="m-0 list-none divide-y divide-line p-0">
            {tags.map((tag) => (
              <TagRow key={tag.slug} tag={tag} onRename={(title) => rename(tag.slug, title)} />
            ))}
          </ul>
        ) : (
          <p className="m-0 px-4 py-3 text-[12px] text-dim">Loading tags</p>
        )}
        <TagAddForm onCreate={create} />
      </div>
    </section>
  );
}
