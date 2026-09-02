import { Button } from "@/shared/ui/button";

export type TourTooltipProps = {
  step: number;
  total: number;
  title: string;
  body: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
};

export function TourTooltip({
  step,
  total,
  title,
  body,
  onNext,
  onBack,
  onSkip,
}: TourTooltipProps) {
  const first = step === 1;
  const last = step === total;

  return (
    <div
      role="dialog"
      aria-label={`Tour step ${step} of ${total}`}
      className="max-w-80 rounded-[10px] border border-accent-line bg-panel-2 p-4 shadow-elevation"
    >
      <p className="m-0 font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
        Step {step} of {total}
      </p>
      <p className="m-0 mt-2 text-sm font-semibold text-fg">{title}</p>
      <p className="m-0 mt-1.5 text-xs leading-[1.55] text-muted">{body}</p>

      <div className="mt-3.5 flex items-center justify-between gap-3">
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
          <Button size="sm" variant="primary" onClick={onNext}>
            {last ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
