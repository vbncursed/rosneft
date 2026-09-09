import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { clsx as cx } from "clsx";
import { nextEnabled } from "@/shared/lib/roving";

export type SegmentedItem<T extends string> = {
  value: T;
  label: ReactNode;
  /** Keyboard shortcut drawn as a kbd chip, e.g. "T". */
  hint?: string;
  disabled?: boolean;
};

export type SegmentedProps<T extends string> = {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** solid is the gizmo toggle; soft is the metrics range picker. */
  tone?: "solid" | "soft";
  /** Gizmo mode fills its panel; the range picker hugs its content. */
  fill?: boolean;
  /** The metrics range picker sets its labels in mono. */
  mono?: boolean;
  className?: string;
};

export function Segmented<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  tone = "solid",
  fill = true,
  mono = false,
  className,
}: SegmentedProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (index: number, event: KeyboardEvent) => {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const next = nextEnabled(items.length, index, direction, (i) => Boolean(items[i].disabled), true);
    onChange(items[next].value);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx(
        "flex gap-1 rounded-[9px] border border-line-2 bg-panel-2 p-1",
        fill ? "w-full" : "w-fit",
        className,
      )}
    >
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={item.disabled}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => onKeyDown(index, e)}
            className={cx(
              "flex items-center justify-center gap-1.5 rounded-control-sm border-none py-1.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
              mono ? "px-2.5 font-mono text-[11px]" : "px-2 text-xs",
              fill && "flex-1",
              item.disabled
                ? "bg-transparent text-dim"
                : active
                  ? tone === "solid"
                    ? "bg-accent font-semibold text-accent-fg"
                    : "bg-accent-soft font-semibold text-accent"
                  : "cursor-pointer bg-transparent text-muted hover:text-fg",
            )}
          >
            {item.label}
            {item.hint ? (
              <kbd
                aria-hidden="true"
                className={cx(
                  "rounded-[3px] border px-1 font-mono text-[9px]",
                  active && tone === "solid" ? "border-black/20" : "border-line-2",
                )}
              >
                {item.hint}
              </kbd>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
