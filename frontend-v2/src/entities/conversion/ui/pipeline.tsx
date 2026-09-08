import { clsx as cx } from "clsx";
import type { PipelineStep } from "../model/pipeline";
import type { StageState } from "../model/status";

export type PipelineProps = {
  steps: PipelineStep[];
  /** Names the list for assistive tech. */
  label?: string;
  className?: string;
};

const CARD: Record<StageState, string> = {
  done: "border-line bg-panel",
  active: "border-warn bg-warn-soft",
  failed: "border-bad bg-bad-soft",
  pending: "border-line bg-panel",
};

const TONE: Record<StageState, string> = {
  done: "bg-ok",
  active: "bg-warn",
  failed: "bg-bad",
  pending: "bg-line-2",
};

const BADGE: Partial<Record<StageState, string>> = {
  active: "border-warn text-warn",
  failed: "border-bad text-bad",
};

/** The state as a word — the badge prints it for the two loud states, the rest is read out only. */
const WORD: Record<StageState, string> = {
  done: "done",
  active: "running",
  failed: "failed",
  pending: "not started",
};

/** The conversion pipeline as the mock's step cards: a rail, a dot, the label, the state, the token. */
export function Pipeline({ steps, label = "Conversion pipeline", className }: PipelineProps) {
  return (
    <ol aria-label={label} className={cx("m-0 flex list-none flex-col gap-[9px] p-0", className)}>
      {steps.map((step) => {
        const badge = BADGE[step.state];
        return (
          <li
            key={step.token}
            className={cx(
              "relative flex items-start gap-3 overflow-hidden rounded-[11px] border py-3.5 pr-4 pl-[19px]",
              CARD[step.state],
            )}
          >
            <span aria-hidden="true" className={cx("absolute inset-y-0 left-0 w-[3px]", TONE[step.state])} />
            <span
              aria-hidden="true"
              className={cx(
                "mt-[5px] size-2 shrink-0 rounded-full",
                TONE[step.state],
                step.state === "active" && "animate-breathe motion-reduce:animate-none",
              )}
            />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-[9px]">
              <p className={cx("m-0 text-[13px]", step.state === "pending" ? "text-muted" : "text-fg")}>
                {step.label}
              </p>
              {badge ? (
                <span
                  className={cx(
                    "rounded-[5px] border px-[7px] py-px font-mono text-[9px] uppercase leading-[1.6] tracking-[0.12em] whitespace-nowrap",
                    badge,
                  )}
                >
                  {WORD[step.state]}
                </span>
              ) : (
                <span className="sr-only">{WORD[step.state]}</span>
              )}
            </div>
            <span className="shrink-0 font-mono text-[10px] whitespace-nowrap text-muted">{step.token}</span>
          </li>
        );
      })}
    </ol>
  );
}
