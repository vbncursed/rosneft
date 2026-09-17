import { clsx as cx } from "clsx";

export type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The accessible name; the visible text sits beside the control in the caller. */
  label: string;
  /**
   * The id of that visible text. Given, it names the control instead of `label`,
   * so the two cannot drift and a reader is not told the same words twice.
   */
  labelledBy?: string;
  disabled?: boolean;
  className?: string;
};

/** The 34×18 toggle: a button with role switch, so Space and Enter flip it for free. */
export function Switch({ checked, onChange, label, labelledBy, disabled = false, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "flex h-[18px] w-[34px] shrink-0 cursor-pointer items-center justify-start rounded-full border-none p-0.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
        checked ? "bg-accent" : "bg-line-2",
        className,
      )}
    >
      {/* 34 − 2×2 padding − 14 knob = 16px of travel: translate-x-4. A transition
          retargets mid-flight, so a quick double flip reverses smoothly. */}
      <span
        aria-hidden="true"
        className={cx(
          "block size-3.5 rounded-full transition-[translate,background-color] duration-150 ease-out motion-reduce:transition-[background-color]",
          checked ? "translate-x-4 bg-accent-fg" : "bg-panel",
        )}
      />
    </button>
  );
}
