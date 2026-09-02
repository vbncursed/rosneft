import type { FormEvent } from "react";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { isComplete, OtpInput } from "@/shared/ui/otp-input";

export type TwoFactorFormProps = {
  /** Who is signing in — shown so a shared machine cannot mislead. */
  account: { username: string; email: string };
  onChangeAccount: () => void;

  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: () => void;
  onUseRecoveryCode: () => void;
  onBack: () => void;

  /** e.g. "0:24"; absent when the code does not expire on a clock. */
  expiresIn?: string;
  submitting?: boolean;
};

const LENGTH = 6;

export function TwoFactorForm({
  account,
  onChangeAccount,
  code,
  onCodeChange,
  onSubmit,
  onUseRecoveryCode,
  onBack,
  expiresIn,
  submitting = false,
}: TwoFactorFormProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Two-factor">
      <div className="flex items-center gap-2.5 rounded-control-lg border border-line bg-panel px-3 py-2.5">
        <Avatar name={account.username} size={30} variant="soft" className="text-[11px]" />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-xs font-medium text-fg">{account.username}</p>
          <p className="m-0 mt-px truncate font-mono text-[10px] text-dim">{account.email}</p>
        </div>
        <button
          type="button"
          onClick={onChangeAccount}
          className="cursor-pointer border-none bg-transparent p-0 font-mono text-[9px] uppercase tracking-[0.14em] text-accent hover:underline"
        >
          change
        </button>
      </div>

      <OtpInput
        autoFocus
        size="lg"
        value={code}
        onChange={onCodeChange}
        length={LENGTH}
        disabled={submitting}
        label="Authenticator code"
      />

      <div className="flex items-center justify-between gap-3">
        {expiresIn ? (
          <span aria-live="polite" className="font-mono text-[10px] text-muted">
            code expires in {expiresIn}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onUseRecoveryCode}
          className="cursor-pointer border-none bg-transparent p-0 font-mono text-[9px] uppercase tracking-[0.14em] text-accent hover:underline"
        >
          use recovery code
        </button>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="justify-center"
        loading={submitting}
        // A short code is a typo, not a decision; the button waits for six.
        disabled={!isComplete(code, LENGTH)}
      >
        Verify
      </Button>

      <Button shape="pill" variant="link" className="self-center" onClick={onBack}>
        ← Back
      </Button>
    </form>
  );
}
