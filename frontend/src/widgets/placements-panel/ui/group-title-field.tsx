import { useEffect, useRef, useState } from "react";
import { GROUP_TITLE_MAX } from "@/entities/placement";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { TextField } from "@/shared/ui/text-field";
import { NEW_GROUP } from "../model/panel-copy";

export type GroupTitleFieldProps = {
  /** The field's accessible name: `New group title`, `Rename group East yard`. */
  label: string;
  submitLabel: string;
  initial?: string;
  busy: boolean;
  /** At a small button's height — New group's field replaces one. */
  compact?: boolean;
  onSubmit: (title: string) => void;
  onCancel: () => void;
};

/** A group title typed in place — New group's and Rename's one field. Enter saves, Escape leaves. */
export function GroupTitleField({ label, submitLabel, initial = "", busy, compact, onSubmit, onCancel }: GroupTitleFieldProps) {
  const [title, setTitle] = useState(initial);
  const trimmed = title.trim();
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed && !busy) onSubmit(trimmed);
      }}
    >
      <TextField
        aria-label={label}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        maxLength={GROUP_TITLE_MAX}
        autoFocus
        compact={compact}
        fieldClassName="min-w-0 flex-1"
      />
      <Button shape="icon" size="xs" variant="primary" type="submit" aria-label={submitLabel} loading={busy} disabled={!trimmed}>
        <Icon name="check" size={12} />
      </Button>
      <Button shape="icon" size="xs" variant="ghost" aria-label="Cancel" onClick={onCancel}>
        <Icon name="close" size={12} />
      </Button>
    </form>
  );
}

/** The panel's last control for a writer: a button that opens the title field in its place. */
export function NewGroup({ busy, onCreate }: { busy: boolean; onCreate: (title: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const closed = useRef(false);
  // The field leaves the DOM with its focus; hand it back to the button or it falls to <body>.
  useEffect(() => {
    if (!open && closed.current) button.current?.focus();
  }, [open]);
  const close = () => {
    closed.current = true;
    setOpen(false);
  };
  if (!open) {
    return (
      <Button ref={button} variant="secondary" size="sm" onClick={() => setOpen(true)} className="w-full">
        <Icon name="folder-plus" size={14} />
        {NEW_GROUP}
      </Button>
    );
  }
  return (
    <GroupTitleField
      label="New group title"
      submitLabel="Create group"
      busy={busy}
      compact
      // A refused create keeps the field and what was typed; the toast says why.
      onSubmit={async (title) => {
        if (await onCreate(title)) close();
      }}
      onCancel={close}
    />
  );
}
