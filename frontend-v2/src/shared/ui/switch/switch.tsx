import { clsx as cx } from "clsx";

export type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** The accessible name; the visible text sits beside the control in the caller. */
  label: string;
  disabled?: boolean;
  className?: string;
};

/** The 34×18 toggle: a button with role switch, so Space and Enter flip it for free. */
export function Switch({ checked, onChange, label, disabled = false, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "flex h-[18px] w-[34px] shrink-0 cursor-pointer items-center rounded-full border-none p-0.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
        checked ? "justify-end bg-accent" : "justify-start bg-line-2",
        className,
      )}
    >
      <span aria-hidden="true" className={cx("block size-3.5 rounded-full", checked ? "bg-accent-fg" : "bg-panel")} />
    </button>
  );
}
