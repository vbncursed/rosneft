import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { OtpInput } from "@/shared/ui/otp-input";
import type { Flow } from "../model/steps";

export type ConfirmPaneProps = {
  flow: Flow;
  code: string;
  error: string | null;
  busy: boolean;
  onCode: (code: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

const NOTES = [
  "The secret is generated server-side and only stored once you confirm a code.",
  "Recovery codes arrive on the next step — you get ten, single-use.",
  "Disabling 2FA later also asks for a code from your authenticator.",
];

/**
 * The half of the wizard both flows share: one current code from the paired
 * app. Regenerating skips the first note — nothing generates a secret there,
 * and a sentence saying otherwise would simply be wrong.
 */
export function ConfirmPane({ flow, code, error, busy, onCode, onConfirm, onCancel }: ConfirmPaneProps) {
  const complete = code.length === 6;
  const notes = flow === "enable" ? NOTES : NOTES.slice(1);

  return (
    <div className="flex flex-col gap-4 p-[26px]">
      <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
        Step {flow === "enable" ? 2 : 1} · confirm
      </p>

      <p className="m-0 text-[13px] leading-[1.6]">
        Enter the 6-digit code your app shows now. It rotates every 30 seconds.
      </p>

      {/* The row's own gap is 8px, not the mock's 7: OtpInput sets gap-2 on
          its base class, and a second gap utility here would be decided by the
          compiled stylesheet's source order rather than by this string. */}
      <OtpInput value={code} onChange={onCode} size="lg" label="Six-digit code" className="max-w-[380px]" />

      {error ? <p role="alert" className="m-0 font-mono text-[11px] text-bad">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          shape="pill"
          size="sm"
          variant={complete ? "primary" : "secondary"}
          disabled={!complete}
          loading={busy}
          onClick={onConfirm}
        >
          {complete ? "Confirm" : "Enter 6 digits"}
        </Button>
        <Button shape="pill" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <ul className="m-0 mt-auto flex list-none flex-col gap-[9px] border-t border-line p-0 pt-3.5">
        {notes.map((note) => (
          <li key={note} className="flex items-start gap-[9px]">
            <Icon name="check" size={13} className="mt-0.5 shrink-0 text-accent" />
            <span className="text-xs leading-[1.5] text-muted">{note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
