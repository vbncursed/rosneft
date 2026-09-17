import { useState, type FormEvent } from "react";
import { generatePassword, validatePassword } from "@/entities/user";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { PasswordField } from "@/shared/ui/password-field";
import { SectionHeading } from "@/shared/ui/section-heading";

export type PasswordSectionProps = {
  busy: boolean;
  /** Resolves only on success — the fields clear off this, never unconditionally. */
  onSubmit: (current: string, next: string) => Promise<void>;
};

/** The password-change form: current + new, Generate on the new field, one submit button. */
export function PasswordSection({ busy, onSubmit }: PasswordSectionProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const error = next ? validatePassword(next) : null;
  const disabled = !current || !next || !!error || busy;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    try {
      await onSubmit(current, next);
      setCurrent("");
      setNext("");
    } catch {
      // A wrong current password, a 422 or a dropped connection — the
      // mutation's own onError already toasted. Leave both fields exactly as
      // typed so the user is not made to retype either one.
    }
  };

  return (
    <Card padded={false} className="flex flex-col gap-4 p-[22px]">
      <SectionHeading
        title="Password"
        count="current password required · new one is validated as you type"
      />
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          <PasswordField
            label="Current password"
            hint="required to confirm it's you"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={busy}
          />
          <PasswordField
            label="New password"
            hint="8+ chars · upper, lower, digit, symbol"
            error={error ?? undefined}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            disabled={busy}
            action={{
              label: "Generate",
              onClick: (reveal) => {
                setNext(generatePassword());
                reveal();
              },
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button type="submit" variant="primary" disabled={disabled} loading={busy}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}
