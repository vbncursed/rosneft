import { useState, type FormEvent } from "react";
import { generatePassword, validatePassword } from "@/entities/user";
import { copyText } from "@/shared/lib/copy-text";
import { notify } from "@/shared/lib/notify";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { PasswordField } from "@/shared/ui/password-field";

export type ResetPasswordDialogProps = {
  open: boolean;
  /** Whose password this is; named in the title. */
  username: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
};

const FORM_ID = "reset-password";

/**
 * Sets someone else's password without asking for the old one. It opens holding
 * a generated password, already shown, so the admin can copy it straight away.
 * Mount it only while open: a fresh mount is what generates a fresh password.
 */
export function ResetPasswordDialog({ open, username, busy = false, onClose, onSubmit }: ResetPasswordDialogProps) {
  const [password, setPassword] = useState(generatePassword);
  const [attempted, setAttempted] = useState(false);
  const rule = validatePassword(password);

  const copy = () =>
    void copyText(password).then((ok) =>
      ok
        ? notify.success("Password copied")
        : notify.error("Could not copy — select it and copy by hand"),
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (!rule) onSubmit(password);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      overline="Reset password"
      title={`New password for ${username}`}
      description="No old password is needed. They are signed out everywhere and sign in with this one."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={password === ""} loading={busy}>
            Change password
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-2.5">
        <PasswordField
          label="Password"
          autoComplete="new-password"
          defaultRevealed
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          error={attempted && rule ? rule : undefined}
          action={{
            label: "Generate",
            onClick: (reveal) => {
              setPassword(generatePassword());
              reveal();
            },
          }}
        />
        <Button size="sm" className="self-start" onClick={copy} disabled={busy}>
          Copy
        </Button>
      </form>
    </Modal>
  );
}
