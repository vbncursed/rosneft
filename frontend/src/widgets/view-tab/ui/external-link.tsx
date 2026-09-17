import { useState } from "react";
import { isSafeHttpUrl } from "@/features/territory-link";
import { Button, linkButtonClass } from "@/shared/ui/button";
import { TextField } from "@/shared/ui/text-field";
import { TOUR_LINK } from "../model/copy";

export type ExternalLinkProps = {
  url: string | undefined;
  /** `territory:write` — the tour URL is a field on the territory. */
  canEdit: boolean;
  saving: boolean;
  /** Answers whether the PATCH landed; a refusal is toasted by the caller. */
  onSave: (url: string) => Promise<boolean>;
};

const TEXT_BUTTON =
  "w-fit cursor-pointer border-none bg-transparent p-0 font-mono text-[10px] uppercase tracking-[0.1em] text-accent transition-[color,scale] duration-150 ease-out active:scale-[0.97] hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";

/** The territory's externally hosted 360° tour: the link, and the field behind it. */
export function ExternalLink({ url, canEdit, saving, onSave }: ExternalLinkProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url ?? "");

  const safe = url !== undefined && isSafeHttpUrl(url);
  if (!safe && !canEdit) return null;

  const cancel = () => {
    setDraft(url ?? "");
    setEditing(false);
  };

  // Only a save that landed closes the editor: a refusal is toasted by the
  // caller and leaves the field on screen with what was typed, so a long URL
  // is fixed rather than retyped.
  const submit = async () => {
    if (await onSave(draft.trim())) setEditing(false);
  };

  return (
    <div data-tour="external-link" className="flex flex-col items-start gap-2">
      {editing && canEdit ? (
        <>
          <TextField
            label="External tour URL"
            mono
            type="url"
            value={draft}
            autoFocus
            placeholder="https://…"
            disabled={saving}
            onChange={(e) => setDraft(e.target.value)}
            fieldClassName="w-full"
          />
          <div className="flex gap-2">
            <Button variant="primary" size="sm" loading={saving} onClick={submit}>
              Save
            </Button>
            <Button size="sm" disabled={saving} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          {safe ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className={linkButtonClass("secondary")}>
              {TOUR_LINK}
            </a>
          ) : null}
          {canEdit ? (
            <button type="button" onClick={() => setEditing(true)} className={TEXT_BUTTON}>
              {safe ? "Edit link" : "Add link"}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
