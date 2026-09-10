import type { Ref } from "react";
import { Button } from "@/shared/ui/button";

export type TourTooltipProps = {
  step: number;
  total: number;
  title: string;
  body: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  /** The overlay focuses Next on every step; nothing else needs the node. */
  nextRef?: Ref<HTMLButtonElement>;
};

// The tour's card, to the mock's own geometry: 320 wide, radius 12, panel
// ground, 16 of padding, 10 between blocks.
export function TourTooltip({
  step,
  total,
  title,
  body,
  onNext,
  onBack,
  onSkip,
  nextRef,
}: TourTooltipProps) {
  const first = step === 1;
  const last = step === total;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Tour step ${step} of ${total}`}
      className="flex w-80 flex-col gap-2.5 rounded-card border border-line-2 bg-panel p-4 shadow-elevation"
    >
      <p className="m-0 font-mono text-[9px] uppercase tracking-[0.2em] text-accent">
        Step {step} / {total}
      </p>
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-sm font-semibold text-fg">{title}</p>
        <p aria-live="polite" className="m-0 text-xs leading-[1.6] text-muted">
          {body}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 pt-0.5">
        <button
          type="button"
          onClick={onSkip}
          className="cursor-pointer border-none bg-transparent p-0 text-xs text-muted transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Skip tour
        </button>
        <div className="flex gap-2">
          <Button size="sm" onClick={onBack} disabled={first}>
            Back
          </Button>
          <Button ref={nextRef} size="sm" variant="primary" onClick={onNext}>
            {last ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
