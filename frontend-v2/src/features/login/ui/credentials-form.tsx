import type { FormEvent } from "react";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Icon } from "@/shared/ui/icon";
import { PasswordField } from "@/shared/ui/password-field";
import { TextField } from "@/shared/ui/text-field";

export type CredentialsFormProps = {
  identifier: string;
  onIdentifierChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  remember: boolean;
  onRememberChange: (value: boolean) => void;

  onSubmit: () => void;
  onForgotPassword: () => void;
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
  onForgotPassword,
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
            className="justify-center"
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
        value={identifier}
        onChange={(e) => onIdentifierChange(e.target.value)}
        error={error}
        autoComplete="username"
        disabled={submitting}
      />

      <PasswordField
        label="Password"
        action={{ label: "Forgot?", onClick: onForgotPassword }}
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        autoComplete="current-password"
        disabled={submitting}
      />

      <Checkbox
        label="Keep me signed in on this device"
        checked={remember}
        onChange={(e) => onRememberChange(e.target.checked)}
        disabled={submitting}
        labelClassName="text-xs text-muted"
      />

      <Button type="submit" size="lg" className="justify-center" loading={submitting}>
        Sign in
      </Button>
    </form>
  );
}
