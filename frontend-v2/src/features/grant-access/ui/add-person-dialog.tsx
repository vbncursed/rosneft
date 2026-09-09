import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dropdown } from "@/shared/ui/dropdown";
import { Modal } from "@/shared/ui/modal";

export type PersonOption = { id: string; username: string; hint?: string };

export type AddPersonDialogProps = {
  open: boolean;
  /** Accounts that do not have access yet. */
  options: PersonOption[];
  busy?: boolean;
  onClose: () => void;
  onAdd: (userId: string) => void;
};

/** One pick from whoever is left. Mount only while open so the pick resets. */
export function AddPersonDialog({ open, options, busy = false, onClose, onAdd }: AddPersonDialogProps) {
  const [id, setId] = useState(options[0]?.id ?? "");
  const exhausted = options.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      overline="Territory access"
      title="Add person"
      description={exhausted ? "Everyone already has access." : "They can open this territory once you save."}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {exhausted ? null : (
            <Button variant="primary" onClick={() => onAdd(id)} loading={busy}>
              Add person
            </Button>
          )}
        </>
      }
    >
      {exhausted ? null : (
        <Dropdown
          label="Person"
          options={options.map((p) => ({ value: p.id, label: p.username, ...(p.hint ? { hint: p.hint } : {}) }))}
          value={id}
          onChange={setId}
          disabled={busy}
        />
      )}
    </Modal>
  );
}
