import { useState, type FormEvent } from "react";
import { generatePassword, validatePassword } from "@/entities/user";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { PasswordField } from "@/shared/ui/password-field";
import { SectionHeading } from "@/shared/ui/section-heading";

export type PasswordSectionProps = {
  busy: boolean;
  onSubmit: (current: string, next: string) => void;
};

/** The password-change form: current + new, Generate on the new field, one submit button. */
export function PasswordSection({ busy, onSubmit }: PasswordSectionProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const error = next ? validatePassword(next) : null;
  const disabled = !current || !next || !!error || busy;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    onSubmit(current, next);
    setCurrent("");
    setNext("");
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
            hint="At least 12 characters"
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
