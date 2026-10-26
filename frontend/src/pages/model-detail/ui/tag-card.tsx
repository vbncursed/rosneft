import { TagChip, TagSelect, type ModelTag } from "@/entities/model-tag";

export type TagCardProps = {
  tag: ModelTag;
  /** The tag list; `undefined` while it loads or after it failed. */
  tags: ModelTag[] | undefined;
  tagsError: string | null;
  canWrite: boolean;
  /** A save is in flight. */
  busy: boolean;
  onTag: (slug: string) => void;
};

/** The model's tag; with model:write, the control that moves it to another. */
export function TagCard({ tag, tags, tagsError, canWrite, busy, onTag }: TagCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-panel p-[18px]">
      <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">Tag</p>
      <div>
        <TagChip tag={tag} />
      </div>
      {canWrite ? (
        <TagSelect
          tags={tags}
          value={tag.slug}
          onChange={onTag}
          error={tagsError ?? undefined}
          disabled={busy}
          label="Change tag"
        />
      ) : null}
    </div>
  );
}
