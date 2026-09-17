import { clsx as cx } from "clsx";
import type { Step, StepTone } from "../model/steps";

export type StepChipsProps = { steps: Step[] };

const SKIN: Record<StepTone, string> = {
  active: "border-accent bg-accent-soft text-accent",
  done: "border-ok bg-transparent text-ok",
  pending: "border-line-2 bg-transparent text-muted",
};

/**
 * Where the reader is in the wizard. Local rather than `widgets/auth-steps`:
 * that one takes a single current step and calls every earlier one completed,
 * and here the scan and confirm panes are live at the same time — it would
 * announce a scan the person has not done yet.
 */
export function StepChips({ steps }: StepChipsProps) {
  return (
    <ol aria-label="Two-factor progress" className="m-0 flex list-none flex-wrap gap-2 p-0">
      {steps.map((step) => (
        <li
          key={step.label}
          aria-current={step.tone === "active" ? "step" : undefined}
          className={cx(
            "rounded-full border px-[13px] py-[5px] font-mono text-[9px] uppercase tracking-[0.14em]",
            SKIN[step.tone],
          )}
        >
          {step.label}
          {/* Spoken only: the colour says "done" to everyone else. */}
          {step.tone === "done" ? <span className="sr-only">completed</span> : null}
        </li>
      ))}
    </ol>
  );
}
