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
  /** The reset landed: the dialog keeps the password on screen until closed. */
  done?: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
};

const FORM_ID = "reset-password";

/**
 * Sets someone else's password without asking for the old one. It opens holding
 * a generated password, already shown, so the admin can copy it straight away.
 * Mount it only while open: a fresh mount is what generates a fresh password.
 * Once `done`, it holds the only copy of what was set, so it stays — revealed,
 * read-only and copyable — until the reader presses Done.
 */
export function ResetPasswordDialog({
  open,
  username,
  busy = false,
  done = false,
  onClose,
  onSubmit,
}: ResetPasswordDialogProps) {
  const [password, setPassword] = useState(generatePassword);
  const [attempted, setAttempted] = useState(false);
  const rule = validatePassword(password);

  const copy = (text: string) =>
    void copyText(text).then((ok) =>
      ok
        ? notify.success("Password copied")
        : notify.error("Could not copy — select it and copy by hand"),
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (done) return; // Enter in the read-only field must not reset twice.
    setAttempted(true);
    if (!rule) onSubmit(password);
  };

  return (
    <Modal
      open={open}
      // Escape and the backdrop wait for the reset, as Cancel does, and once
      // it lands only Done closes: the password on screen is the only copy.
      onClose={busy || done ? () => {} : onClose}
      overline="Reset password"
      title={`New password for ${username}`}
      description={
        done
          ? "Password changed. The user was signed out everywhere."
          : "No old password is needed. They are signed out everywhere and sign in with this one."
      }
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form={FORM_ID} variant="primary" disabled={password === ""} loading={busy}>
              Change password
            </Button>
          </>
        )
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-2.5">
        <PasswordField
          label="Password"
          autoComplete="new-password"
          defaultRevealed
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          readOnly={done}
          disabled={busy}
          error={attempted && rule ? rule : undefined}
          action={
            done
              ? undefined
              : {
                  label: "Generate",
                  onClick: (reveal) => {
                    const next = generatePassword();
                    setPassword(next);
                    reveal();
                    copy(next);
                  },
                }
          }
        />
        <Button
          size="sm"
          className="self-start"
          aria-label="Copy password"
          onClick={() => copy(password)}
          disabled={busy}
        >
          Copy
        </Button>
      </form>
    </Modal>
  );
}
