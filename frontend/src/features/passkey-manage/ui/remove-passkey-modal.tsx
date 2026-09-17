import { useState } from "react";
import type { Passkey } from "@/entities/passkey";
import { Button } from "@/shared/ui/button";
import { Callout } from "@/shared/ui/callout";
import { Modal } from "@/shared/ui/modal";
import { isComplete, OtpInput } from "@/shared/ui/otp-input";
import { PasswordField } from "@/shared/ui/password-field";
import { TextField } from "@/shared/ui/text-field";
import type { RemovalFactor } from "../model/removal-factor";

const OTP_LENGTH = 6;

export type RemovePasskeyModalProps = {
  open: boolean;
  passkey: Passkey;
  factor: RemovalFactor;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (credential: { code?: string; password?: string }) => void;
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
  const [otp, setOtp] = useState("");
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [password, setPassword] = useState("");

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
          The gateway derives the required factor server-side, so removal would be refused whichever
          field we collected. Nothing was sent.
        </Callout>
      </Modal>
    );
  }

  const code = useRecovery ? recovery.trim() : otp;
  const ready = factor === "code" ? (useRecovery ? code !== "" : isComplete(otp, OTP_LENGTH)) : password !== "";

  const confirm = () => onConfirm(factor === "code" ? { code } : { password });

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
          <Button variant="danger" disabled={!ready || busy} loading={busy} onClick={confirm}>
            Remove
          </Button>
        </>
      }
    >
      {factor === "code" ? (
        useRecovery ? (
          <TextField
            label="Recovery code"
            placeholder="xxxxx-xxxxx"
            value={recovery}
            onChange={(e) => setRecovery(e.target.value)}
            disabled={busy}
          />
        ) : (
          <>
            <OtpInput
              value={otp}
              onChange={setOtp}
              length={OTP_LENGTH}
              disabled={busy}
              label="Authenticator code"
            />
            <button
              type="button"
              onClick={() => setUseRecovery(true)}
              disabled={busy}
              className="w-fit cursor-pointer self-start border-none bg-transparent p-0 font-mono text-[10px] uppercase tracking-[0.14em] text-accent disabled:cursor-not-allowed disabled:opacity-55"
            >
              Use a recovery code instead
            </button>
          </>
        )
      ) : (
        <PasswordField
          label="Account password"
          hint="Asked because two-factor is off on this account — with it on, an authenticator code is required instead."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
      )}
    </Modal>
  );
}
