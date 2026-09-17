import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { Modal } from "@/shared/ui/modal";
import type { RoleChip } from "./role-chips";

export type AddRoleDialogProps = {
  open: boolean;
  /** Roles the person does not hold yet. */
  options: RoleChip[];
  busy?: boolean;
  onClose: () => void;
  onAdd: (slug: string) => void;
};

/** One pick from what is left. Mount only while open so the pick resets. */
export function AddRoleDialog({ open, options, busy = false, onClose, onAdd }: AddRoleDialogProps) {
  const [slug, setSlug] = useState(options[0]?.slug ?? "");
  const exhausted = options.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      overline="Roles"
      title="Add role"
      description={exhausted ? "Every role is already granted." : "The person gains everything the role grants."}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {exhausted ? null : (
            <Button variant="primary" onClick={() => onAdd(slug)} loading={busy}>
              Add role
            </Button>
          )}
        </>
      }
    >
      {exhausted ? null : (
        <Dropdown
          label="Role"
          options={options.map((r) => ({ value: r.slug, label: r.title }))}
          value={slug}
          onChange={setSlug}
          disabled={busy}
        />
      )}
    </Modal>
  );
}
