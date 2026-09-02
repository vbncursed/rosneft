import { cx } from "@/shared/lib/cx";

export type QuantityStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Names the pair of buttons and the readout for assistive tech. */
  label?: string;
  className?: string;
};

const cell =
  "flex size-7 items-center justify-center rounded-control-sm border border-line-2 bg-panel-2 text-sm text-fg transition-colors duration-150 enabled:cursor-pointer enabled:hover:border-accent-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-line disabled:text-dim disabled:opacity-50";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  disabled = false,
  label = "Quantity",
  className,
}: QuantityStepperProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className={cx("flex items-center gap-1.5", className)} role="group" aria-label={label}>
      <button
        type="button"
        className={cell}
        disabled={disabled || value <= min}
        aria-label={`Decrease ${label.toLowerCase()}`}
        onClick={() => onChange(clamp(value - step))}
      >
        −
      </button>
      <output
        aria-live="polite"
        className="flex h-7 w-11 items-center justify-center rounded-control-sm border border-line-2 bg-panel-2 font-mono text-[13px] text-fg"
      >
        {value}
      </output>
      <button
        type="button"
        className={cell}
        disabled={disabled || value >= max}
        aria-label={`Increase ${label.toLowerCase()}`}
        onClick={() => onChange(clamp(value + step))}
      >
        +
      </button>
    </div>
  );
}
