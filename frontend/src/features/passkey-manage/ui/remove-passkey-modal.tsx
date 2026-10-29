import { useState } from "react";
import type { Passkey } from "@/entities/passkey";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import { Modal } from "@/shared/ui/modal";
import type { RemovalFactor } from "../model/removal-factor";
import { StepUpFields, type StepUpCredential } from "./step-up-fields";

export type RemovePasskeyModalProps = {
  open: boolean;
  passkey: Passkey;
  factor: RemovalFactor;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (credential: StepUpCredential) => void;
};

/**
 * The gateway decides which factor to demand; this modal only draws the
 * matching body. `factor === "unavailable"` collects nothing — there is
 * nothing to submit, so no Cancel/confirm pair is drawn at all.
 */
export function RemovePasskeyModal({
  open,
  passkey,
  factor,
  busy = false,
  onClose,
  onConfirm,
}: RemovePasskeyModalProps) {
  const [credential, setCredential] = useState<StepUpCredential | null>(null);

  if (factor === "unavailable") {
    return (
      <Modal
        open={open}
        onClose={onClose}
        tone="warning"
        overline="Remove passkey · blocked"
        title="Two-factor status unavailable"
        description="Passkeys cannot be removed right now. Try again shortly."
        footer={<Button onClick={onClose}>Close</Button>}
      >
        <Callout tone="warn" size="lg">
          The gateway derives the required factor server-side, so removal would be refused whichever field we collected.
          Nothing was sent.
        </Callout>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="danger"
      overline="Remove passkey · danger"
      title={`Remove “${passkey.name}”?`}
      description={
        factor === "code"
          ? "Enter your authenticator code to confirm removal."
          : "Enter your account password to confirm removal."
      }
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!credential || busy}
            loading={busy}
            onClick={() => credential && onConfirm(credential)}
          >
            Remove
          </Button>
        </>
      }
    >
      <StepUpFields factor={factor} disabled={busy} onChange={setCredential} />
    </Modal>
  );
}
