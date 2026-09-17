import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: ReactNode;
  /** Names the action exactly as the button that opened this did. */
  confirmLabel: string;
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** A yes/no question with one irreversible answer, built on the native dialog. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      tone={tone}
      overline={tone === "danger" ? "Confirm · danger" : "Confirm"}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
