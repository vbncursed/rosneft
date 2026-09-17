import { useState, type FormEvent } from "react";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { Modal } from "@/shared/ui/modal";
import { TextField } from "@/shared/ui/text-field";

export type StartFrom = { slug: string; title: string; permissionSlugs: string[] };

export type CreateRoleDialogProps = {
  open: boolean;
  /** Roles whose set may be copied as the starting point. */
  startFrom: StartFrom[];
  busy?: boolean;
  onClose: () => void;
  onCreate: (input: { title: string; permissionSlugs: string[] }) => void;
};

const EMPTY = "__empty__";
const FORM_ID = "create-role";

/** What the page's dashed card promises: start from Guest, or duplicate a set. */
export function CreateRoleDialog({ open, startFrom, busy = false, onClose, onCreate }: CreateRoleDialogProps) {
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState(EMPTY);
  const complete = title.trim() !== "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!complete) return;
    const source = startFrom.find((r) => r.slug === from);
    onCreate({ title: title.trim(), permissionSlugs: source?.permissionSlugs ?? [] });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      overline="New role"
      title="Create role"
      description="The slug is derived from the title. Permissions can be edited right after."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={!complete} loading={busy}>
            Create role
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-3.5">
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        <Dropdown
          label="Start from"
          options={[
            { value: EMPTY, label: "Empty set" },
            ...startFrom.map((r) => ({ value: r.slug, label: r.title, hint: `${r.permissionSlugs.length}` })),
          ]}
          value={from}
          onChange={setFrom}
          disabled={busy}
        />
      </form>
    </Modal>
  );
}
