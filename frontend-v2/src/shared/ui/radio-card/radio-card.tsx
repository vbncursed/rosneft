import { clsx as cx } from "clsx";
import { useId, type ReactNode } from "react";

export type RadioCardOption<T extends string> = {
  value: T;
  title: string;
  /** One line explaining what choosing this does. */
  hint: ReactNode;
  disabled?: boolean;
};

export type RadioCardsProps<T extends string> = {
  options: RadioCardOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for assistive tech. */
  label: string;
  className?: string;
};

/** A choice where each option needs a sentence — bigger than a segmented control. */
export function RadioCards<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: RadioCardsProps<T>) {
  const name = useId();

  return (
    <div role="radiogroup" aria-label={label} className={cx("flex flex-col gap-[7px]", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <label
            key={option.value}
            className={cx(
              "flex items-start gap-2.5 rounded-[9px] border px-3 py-2.5 transition-colors duration-150",
              option.disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer",
              active ? "border-accent bg-accent-soft" : "border-line bg-panel-2",
            )}
          >
            {/* The real radio stays in the tree for the keyboard and for forms;
                the ring beside it is what the design draws. */}
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={active}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className={cx(
                "mt-0.5 size-[13px] shrink-0 rounded-full bg-panel peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                active ? "border-4 border-accent" : "border border-line-2",
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-fg">{option.title}</span>
              <span className="mt-[3px] block text-[11px] leading-[1.45] text-muted">
                {option.hint}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
