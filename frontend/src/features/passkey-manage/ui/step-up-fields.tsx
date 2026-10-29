import { useState } from "react";
import { isComplete, OtpInput } from "@/shared/ui/otp-input";
import { PasswordField } from "@/shared/ui/password-field";
import { TextField } from "@/shared/ui/text-field";
import type { RemovalFactor } from "../model/removal-factor";

const OTP_LENGTH = 6;

/** What the gateway's step-up accepts: a TOTP/recovery code, or the password. */
export type StepUpCredential = { code?: string; password?: string };

export type StepUpFieldsProps = {
  /** Never "unavailable": the callers draw their own blocked state for that. */
  factor: Exclude<RemovalFactor, "unavailable">;
  disabled?: boolean;
  /** The credential once it is complete enough to submit, null while it is not. */
  onChange: (credential: StepUpCredential | null) => void;
};

/**
 * The code-or-password prompt every passkey change re-authenticates with. The
 * gateway derives the factor from live 2FA state; this only draws the field it
 * will accept, for both removing and adding a key.
 */
export function StepUpFields({ factor, disabled = false, onChange }: StepUpFieldsProps) {
  const [otp, setOtp] = useState("");
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [password, setPassword] = useState("");

  const emit = (next: { otp?: string; recovery?: string; useRecovery?: boolean; password?: string }) => {
    const o = next.otp ?? otp;
    const r = (next.recovery ?? recovery).trim();
    const rec = next.useRecovery ?? useRecovery;
    const p = next.password ?? password;
    if (factor === "password") onChange(p === "" ? null : { password: p });
    else if (rec) onChange(r === "" ? null : { code: r });
    else onChange(isComplete(o, OTP_LENGTH) ? { code: o } : null);
  };

  if (factor === "password") {
    return (
      <PasswordField
        label="Account password"
        hint="Asked because two-factor is off on this account — with it on, an authenticator code is required instead."
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          emit({ password: e.target.value });
        }}
        disabled={disabled}
      />
    );
  }
  if (useRecovery) {
    return (
      <TextField
        label="Recovery code"
        placeholder="xxxxx-xxxxx"
        value={recovery}
        onChange={(e) => {
          setRecovery(e.target.value);
          emit({ recovery: e.target.value });
        }}
        disabled={disabled}
      />
    );
  }
  return (
    <>
      <OtpInput
        value={otp}
        onChange={(v) => {
          setOtp(v);
          emit({ otp: v });
        }}
        length={OTP_LENGTH}
        disabled={disabled}
        label="Authenticator code"
      />
      <button
        type="button"
        onClick={() => {
          setUseRecovery(true);
          emit({ useRecovery: true });
        }}
        disabled={disabled}
        className="w-fit cursor-pointer self-start border-none bg-transparent p-0 font-mono text-[10px] uppercase tracking-[0.14em] text-accent disabled:cursor-not-allowed disabled:opacity-55"
      >
        Use a recovery code instead
      </button>
    </>
  );
}
