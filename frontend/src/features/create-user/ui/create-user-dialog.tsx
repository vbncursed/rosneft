import { useState, type FormEvent } from "react";
import { generatePassword, validatePassword, type NewUser } from "@/entities/user";
import type { RoleChip } from "@/features/role-assign";
import { copyText } from "@/shared/lib/copy-text";
import { notify } from "@/shared/lib/notify";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Modal } from "@/shared/ui/modal";
import { PasswordField } from "@/shared/ui/password-field";
import { TextField } from "@/shared/ui/text-field";

export type CreateUserDialogProps = {
  open: boolean;
  /** Every role that exists, for the initial grant. */
  roles: RoleChip[];
  busy?: boolean;
  onClose: () => void;
  onCreate: (input: NewUser) => void;
};

const FORM_ID = "create-user";

/**
 * The fields the gateway's CreateUserRequest takes and nothing more. Mount it
 * only while open — its state resets by unmounting, not by an effect.
 */
export function CreateUserDialog({ open, roles, busy = false, onClose, onCreate }: CreateUserDialogProps) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [attempted, setAttempted] = useState(false);
  const complete = email.trim() !== "" && username.trim() !== "" && password !== "";
  const rule = validatePassword(password);

  const toggle = (slug: string) =>
    setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (!complete || rule) return;
    onCreate({ email: email.trim(), username: username.trim(), password, roleSlugs: picked });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      overline="New account"
      title="Create user"
      description="They sign in with this password and can change it themselves."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" disabled={!complete} loading={busy}>
            Create user
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-3.5">
        <TextField
          label="Email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
        <TextField
          label="Username"
          mono
          autoComplete="off"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={busy}
        />
        <PasswordField
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          error={attempted && rule ? rule : undefined}
          action={{
            label: "Generate",
            onClick: (reveal) => {
              const next = generatePassword();
              setPassword(next);
              reveal();
              void copyText(next).then((ok) =>
                ok
                  ? notify.success("Password copied")
                  : notify.error("Could not copy — select it and copy by hand"),
              );
            },
          }}
        />
        {roles.length > 0 ? (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
              Roles
            </legend>
            {roles.map((role) => (
              <Checkbox
                key={role.slug}
                label={role.title}
                checked={picked.includes(role.slug)}
                onChange={() => toggle(role.slug)}
                disabled={busy}
              />
            ))}
          </fieldset>
        ) : null}
      </form>
    </Modal>
  );
}
