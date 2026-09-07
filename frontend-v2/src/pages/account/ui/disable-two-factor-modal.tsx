import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { isComplete, OtpInput } from "@/shared/ui/otp-input";

const OTP_LENGTH = 6;

export type DisableTwoFactorModalProps = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (code: string) => void;
};

/**
 * Collects the one thing `POST /api/auth/2fa/disable` accepts: a current code
 * from the authenticator app. Not the account password, and not a recovery
 * code — the server refuses both, so neither is offered here.
 */
export function DisableTwoFactorModal({ open, busy = false, onClose, onConfirm }: DisableTwoFactorModalProps) {
  const [code, setCode] = useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="danger"
      overline="Disable two-factor · danger"
      title="Turn two-factor off?"
      description="Enter a current code from your authenticator app. A recovery code is not accepted here."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!isComplete(code, OTP_LENGTH) || busy}
            loading={busy}
            onClick={() => onConfirm(code)}
          >
            Disable
          </Button>
        </>
      }
    >
      <OtpInput value={code} onChange={setCode} length={OTP_LENGTH} disabled={busy} label="Authenticator code" />
    </Modal>
  );
}
