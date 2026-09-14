import type { CSSProperties } from "react";
import { clsx as cx } from "clsx";

export type RangeProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** The accessible name; the visible label is the caller's row. */
  label: string;
  disabled?: boolean;
  className?: string;
};

/**
 * The mock's slider: a 4 px track in `--border`, the accent fill up to the
 * value, a 14 px knob with a 1 px accent border on panel. The fill is one CSS
 * variable on the input — a gradient background — so the native control keeps
 * its keyboard handling and the design keeps its look.
 */
export function Range({ value, min, max, step, onChange, label, disabled = false, className }: RangeProps) {
  const fill = max > min ? `${((value - min) / (max - min)) * 100}%` : "0%";
  return (
    <input
      type="range"
      aria-label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ "--range-fill": fill } as CSSProperties}
      className={cx(
        "h-1 w-full cursor-pointer appearance-none rounded-full bg-[linear-gradient(to_right,var(--color-accent)_var(--range-fill),var(--color-line)_var(--range-fill))] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
        "[&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-accent [&::-webkit-slider-thumb]:bg-panel",
        "[&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-accent [&::-moz-range-thumb]:bg-panel",
        className,
      )}
    />
  );
}
