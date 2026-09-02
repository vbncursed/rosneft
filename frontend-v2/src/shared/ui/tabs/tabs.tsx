import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/shared/lib/cx";
import { nextEnabled } from "@/shared/lib/roving";

export type Tab<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
};

export type TabsProps<T extends string> = {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
};

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  className,
}: TabsProps<T>) {
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
      className={cx("flex gap-5 border-b border-line", className)}
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
              "-mb-px border-x-0 border-t-0 border-b-2 bg-transparent px-0 py-2 text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              tab.disabled
                ? "cursor-not-allowed border-transparent text-dim opacity-50"
                : active
                  ? "cursor-pointer border-accent font-semibold text-accent"
                  : "cursor-pointer border-transparent text-muted hover:text-fg",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
