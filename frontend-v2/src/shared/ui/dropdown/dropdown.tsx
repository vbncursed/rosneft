import { useId, useRef, useState, type KeyboardEvent } from "react";
import { cx } from "@/shared/lib/cx";
import { nextEnabled } from "@/shared/lib/roving";
import { useDismiss } from "@/shared/lib/use-dismiss";

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
};

export function Dropdown<T extends string>({
  options,
  value,
  onChange,
  label,
  ariaLabel,
  disabled = false,
  className,
}: DropdownProps<T>) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const [active, setActive] = useState(selectedIndex);

  useDismiss(root, open, () => setOpen(false));

  const selected = options[selectedIndex];

  const choose = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setActive(selectedIndex);
        setOpen(true);
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => nextEnabled(options.length, i, 1, (n) => Boolean(options[n].disabled)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => nextEnabled(options.length, i, -1, (n) => Boolean(options[n].disabled)));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
    }
  };

  return (
    <div ref={root} className={cx("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => {
          setActive(selectedIndex);
          setOpen((o) => !o);
        }}
        onKeyDown={onKeyDown}
        className={cx(
          "flex w-full items-center justify-between gap-2.5 border bg-panel-2 px-3 py-2.5 text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          disabled
            ? "cursor-not-allowed border-line text-dim opacity-55"
            : "cursor-pointer text-fg",
          open ? "rounded-t-control border-accent" : "rounded-control",
          !open && !disabled && "border-line-2",
        )}
      >
        {label ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            {label}
          </span>
        ) : null}
        <span className="flex-1 text-left">{selected?.label}</span>
        <span aria-hidden="true" className={open ? "text-accent" : "text-muted"}>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel ?? label}
          aria-activedescendant={`${listId}-${active}`}
          className="absolute z-10 m-0 w-full list-none rounded-b-control border border-t-0 border-accent-line bg-panel p-1.5 shadow-elevation"
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
                  "flex items-center gap-2 rounded-control-sm px-2.5 py-[7px] text-[13px]",
                  option.disabled
                    ? "cursor-not-allowed text-dim opacity-60"
                    : "cursor-pointer text-fg",
                  isSelected && !option.disabled && "bg-accent-soft",
                  index === active && !isSelected && !option.disabled && "bg-panel-2",
                )}
              >
                <span aria-hidden="true" className="text-[10px] text-accent">
                  {isSelected ? "●" : "○"}
                </span>
                <span className="flex-1">{option.label}</span>
                {option.hint ? (
                  <span className="font-mono text-[10px] text-dim">{option.hint}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
