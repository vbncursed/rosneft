import type { FormEvent } from "react";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Icon } from "@/shared/ui/icon";
import { PasswordField } from "@/shared/ui/password-field";
import { TextField } from "@/shared/ui/text-field";

/**
 * The screen mock draws its controls one notch below the design system's Large
 * (14px, 13x20 pad) and puts the fields on `panel` against the `panel-2` ground.
 * cva utilities cannot be overridden by appending, hence the important modifier.
 */
const FIELD = "bg-panel! rounded-[9px]! py-[11px]! text-[14px]! leading-[normal]!";

const PRIMARY = "justify-center gap-[9px]! px-5! py-[13px]! text-[14px]!";
const SECONDARY = "justify-center bg-panel! px-5! py-3! text-[14px]! font-medium!";

export type CredentialsFormProps = {
  identifier: string;
  onIdentifierChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  /**
   * Absent while nothing acts on it. The gateway's LoginRequest carries no
   * such field and the session cookie is a fixed 720 hours, so a checkbox
   * claiming to limit exposure on a shared machine would be a lie — worse
   * than no control at all. Optional for the same reason `onPasskey` is.
   */
  remember?: boolean;
  onRememberChange?: (value: boolean) => void;

  onSubmit: () => void;
  /** Absent where passkeys cannot work — the desktop shell's loopback origin. */
  onPasskey?: () => void;

  submitting?: boolean;
  /** Shown under the identifier when the server rejected it. */
  error?: string;
};

export function CredentialsForm({
  identifier,
  onIdentifierChange,
  password,
  onPasswordChange,
  remember,
  onRememberChange,
  onSubmit,
  onPasskey,
  submitting = false,
  error,
}: CredentialsFormProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5" aria-label="Sign in">
      {onPasskey ? (
        <>
          <Button
            variant="primary"
            size="lg"
            className={PRIMARY}
            onClick={onPasskey}
            disabled={submitting}
          >
            <Icon name="passkey" size={16} />
            Continue with passkey
          </Button>

          <div className="flex items-center gap-3.5 font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
            or password
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : null}

      <TextField
        label="Email or username"
        className={`${FIELD} px-[13px]!`}
        value={identifier}
        onChange={(e) => onIdentifierChange(e.target.value)}
        error={error}
        autoComplete="username"
        disabled={submitting}
      />

      <PasswordField
        className={`${FIELD} pl-[13px]! pr-[42px]!`}
        label="Password"
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        autoComplete="current-password"
        disabled={submitting}
      />

      {onRememberChange ? (
        <Checkbox
          label="Keep me signed in on this device"
          checked={remember ?? false}
          onChange={(e) => onRememberChange(e.target.checked)}
          disabled={submitting}
          labelClassName="text-xs text-muted"
        />
      ) : null}

      <Button type="submit" size="lg" className={SECONDARY} loading={submitting}>
        Sign in
      </Button>
    </form>
  );
}
