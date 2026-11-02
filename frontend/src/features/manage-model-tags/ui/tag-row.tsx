import { useState, type FormEvent, type KeyboardEvent } from "react";
import { UNGROUPED_TAG_SLUG, titleError, type ModelTag } from "@/entities/model-tag";
import { Button } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/text-field";
import type { Outcome } from "../model/use-model-tags-admin";

export type TagRowProps = {
  tag: ModelTag;
  onRename: (title: string) => Promise<Outcome>;
};

/** One tag: its title and slug, and an inline rename. `ungrouped` is built in and read-only. */
export function TagRow({ tag, onRename }: TagRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const stop = () => {
    setDraft(null);
    setRefusal(null);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (draft === null || titleError(draft) || busy) return;
    setBusy(true);
    const outcome = await onRename(draft);
    setBusy(false);
    if (outcome === null) stop();
    else setRefusal(outcome);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") stop();
  };

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-2.5">
      {draft === null ? (
        <>
          <div className="min-w-0">
            <div className="truncate text-[13px] text-fg">{tag.title}</div>
            <div className="font-mono text-[11px] text-dim">{tag.slug}</div>
          </div>
          {tag.slug === UNGROUPED_TAG_SLUG ? (
            <span className="text-[11px] text-dim">Built in, cannot be changed</span>
          ) : (
            <Button size="sm" aria-label={`Rename ${tag.title}`} onClick={() => setDraft(tag.title)}>
              Rename
            </Button>
          )}
        </>
      ) : (
        <form onSubmit={submit} onKeyDown={onKeyDown} className="flex w-full flex-wrap items-start gap-2">
          <TextField
            compact
            autoFocus
            aria-label={`Title for ${tag.title}`}
            value={draft}
            error={refusal ?? (draft === tag.title ? null : titleError(draft))}
            disabled={busy}
            onChange={(e) => {
              setDraft(e.target.value);
              setRefusal(null);
            }}
            fieldClassName="min-w-48 flex-1"
          />
          <Button size="sm" onClick={stop} disabled={busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            type="submit"
            variant="primary"
            aria-label={`Save title for ${tag.title}`}
            disabled={titleError(draft) !== null}
            loading={busy}
          >
            Save
          </Button>
        </form>
      )}
    </li>
  );
}
