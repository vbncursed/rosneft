"use client";

interface QuantityStepperProps {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  // Optional accessible name for the group (e.g. the object title).
  label?: string;
}

const BTN =
  "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded border border-white/20 bg-black/60 text-neutral-100 transition-colors hover:border-white/50 disabled:cursor-not-allowed disabled:opacity-40";

// QuantityStepper is a −/+ numeric control. The native <input type=number>
// spinner arrows are suppressed (.no-spinner) so only our own buttons drive the
// value; typing is still allowed and clamped to [min, max].
export default function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 50,
  label,
}: QuantityStepperProps) {
  const clamp = (n: number) =>
    Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : min;

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label ? `Quantity for ${label}` : "Quantity"}>
      <button
        type="button"
        className={BTN}
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="no-spinner w-10 rounded border border-white/20 bg-black/60 px-1 py-0.5 text-center text-xs tabular-nums text-neutral-100 outline-none focus:border-cyan-400/60"
      />
      <button
        type="button"
        className={BTN}
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
