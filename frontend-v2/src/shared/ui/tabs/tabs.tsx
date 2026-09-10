import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { clsx as cx } from "clsx";
import { nextEnabled } from "@/shared/lib/roving";

export type Tab<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

/** `underline` is the page-level rule; `segments` is the filled strip a side panel wears. */
export type TabsVariant = "underline" | "segments";

export type TabsProps<T extends string> = {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  variant?: TabsVariant;
  className?: string;
};

const FOCUS =
  "transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

// One property, one place per state: clsx concatenates, so the two variants
// carry their own complete base string rather than layering on a shared one.
const STYLES = {
  underline: {
    list: "flex gap-5 border-b border-line",
    tab: `-mb-px border-x-0 border-t-0 border-b-2 bg-transparent px-0 py-2 text-[13px] ${FOCUS}`,
    disabled: "cursor-not-allowed border-transparent text-dim opacity-50",
    active: "cursor-pointer border-accent font-semibold text-accent",
    idle: "cursor-pointer border-transparent text-muted hover:text-fg",
  },
  segments: {
    list: "flex gap-1",
    tab: `flex-1 rounded-[7px] border-0 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] ${FOCUS}`,
    disabled: "cursor-not-allowed bg-transparent text-dim opacity-50",
    active: "cursor-pointer bg-accent-soft font-semibold text-accent",
    idle: "cursor-pointer bg-transparent text-muted hover:text-fg",
  },
} as const;

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  variant = "underline",
  className,
}: TabsProps<T>) {
  const style = STYLES[variant];
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (index: number, event: KeyboardEvent) => {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const next = nextEnabled(
      tabs.length,
      index,
      direction,
      (i) => Boolean(tabs[i].disabled),
      true,
    );
    onChange(tabs[next].value);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx(style.list, className)}
    >
      {tabs.map((tab, index) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={tab.disabled}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => onKeyDown(index, e)}
            className={cx(
              style.tab,
              tab.disabled ? style.disabled : active ? style.active : style.idle,
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
