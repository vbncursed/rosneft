import { useId } from "react";
import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";
import { useDropdownInteraction } from "./use-dropdown-interaction";

export type DropdownOption<T extends string> = {
  value: T;
  label: string;
  /** Right-aligned mono note — a count, or why the option is unavailable. */
  hint?: string;
  disabled?: boolean;
};

export type DropdownProps<T extends string> = {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Overline shown inside the closed trigger, e.g. "Status". */
  label?: string;
  /** Names the control when no visible label is given. */
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  /** The trigger's id, so a <label htmlFor> can name it. */
  id?: string;
  /** Marks the trigger `aria-invalid` and draws its border in the error tone. */
  invalid?: boolean;
  /** Id of the hint or error text that describes the trigger. */
  describedBy?: string;
};

export function Dropdown<T extends string>({
  options,
  value,
  onChange,
  label,
  ariaLabel,
  disabled = false,
  className,
  id,
  invalid = false,
  describedBy,
}: DropdownProps<T>) {
  const listId = useId();
  const { root, button, open, selected, active, setActive, choose, toggle, onKeyDown } = useDropdownInteraction({
    options,
    value,
    onChange,
  });

  return (
    <div ref={root} className={cx("relative", className)}>
      <button
        ref={button}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className={cx(
          "flex w-full items-center justify-between gap-2.5 border bg-panel-2 px-3 py-2.5 text-[13px] transition-[color,background-color,border-color,scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:active:scale-[0.99]",
          disabled ? "cursor-not-allowed border-line text-dim opacity-55" : "cursor-pointer text-fg",
          open ? "rounded-t-control border-accent" : "rounded-control",
          !open && !disabled && (invalid ? "border-bad" : "border-line-2"),
        )}
      >
        {label ? <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{label}</span> : null}
        <span className="flex-1 text-left">{selected?.label}</span>
        <span
          aria-hidden="true"
          className={cx(
            "flex transition-transform duration-150 ease-out motion-reduce:transition-none",
            open ? "rotate-180 text-accent" : "text-muted",
          )}
        >
          <Icon name="chevron-down" size={12} />
        </span>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel ?? label}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          // Drops from the trigger it is docked to; frequent, so quicker than a menu.
          className="absolute z-10 m-0 w-full origin-top list-none rounded-b-control border border-t-0 border-accent-line bg-panel p-1.5 shadow-elevation transition-[opacity,scale] duration-120 ease-out starting:opacity-0 motion-safe:starting:scale-y-[0.97]"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                onClick={() => choose(index)}
                onMouseEnter={() => !option.disabled && setActive(index)}
                className={cx(
                  "flex items-center gap-2 rounded-control-sm px-2.5 py-[7px] text-[13px] transition-[scale] duration-150 ease-out",
                  option.disabled
                    ? "cursor-not-allowed text-dim opacity-60"
                    : "cursor-pointer text-fg active:scale-[0.97]",
                  isSelected && !option.disabled && "bg-accent-soft",
                  // What Enter would pick: a ring, readable on the selected fill too.
                  index === active && !option.disabled && "outline-2 -outline-offset-2 outline-accent",
                )}
              >
                <span aria-hidden="true" className="flex w-3 justify-center text-accent">
                  {isSelected ? <Icon name="check" size={12} /> : null}
                </span>
                <span className="flex-1">{option.label}</span>
                {option.hint ? <span className="font-mono text-[10px] text-dim">{option.hint}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
