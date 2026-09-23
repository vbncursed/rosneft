import { useState, type FormEvent } from "react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { Textarea, TextField } from "@/shared/ui/text-field";
import { useEditDetails, type DetailsPatch, type EntityKind } from "../model/use-edit-details";

export type EditDetailsDialogProps = {
  kind: EntityKind;
  slug: string;
  title: string;
  description?: string;
  onClose: () => void;
};

type Draft = { title: string; description: string };

const FORM_ID = "edit-details";

/**
 * The fields that differ from what is saved, trimmed — the gateway stores what
 * it is sent; null when none differ or the title is blank.
 */
function changedFields(draft: Draft, saved: Draft): DetailsPatch | null {
  const title = draft.title.trim();
  const description = draft.description.trim();
  if (title === "") return null;
  const patch: DetailsPatch = {
    ...(title !== saved.title ? { title } : {}),
    ...(description !== saved.description ? { description } : {}),
  };
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Title and description of a model or territory. The slug never changes, so
 * links, conversion jobs and access keep working. Mount it only while open —
 * the draft resets by unmounting, not by an effect.
 */
export function EditDetailsDialog({ kind, slug, title, description = "", onClose }: EditDetailsDialogProps) {
  const [draft, setDraft] = useState<Draft>({ title, description });
  const save = useEditDetails(kind, slug);
  const patch = changedFields(draft, { title, description });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (patch) save.mutate(patch, { onSuccess: onClose });
  };

  return (
    <Modal
      open
      onClose={onClose}
      overline={kind === "model" ? "Model" : "Territory"}
      title="Edit details"
      description="The slug stays as it is, so links and placements keep working."
      footer={
        <>
          <Button onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={!patch} loading={save.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-3.5">
        <TextField
          label="Title"
          required
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          disabled={save.isPending}
        />
        <Textarea
          label="Description"
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          disabled={save.isPending}
        />
      </form>
    </Modal>
  );
}
