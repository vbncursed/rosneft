import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { clsx as cx } from "clsx";
import { nextEnabled } from "@/shared/lib/roving";
import { useDismiss } from "@/shared/lib/use-dismiss";

export type MenuItemTone = "default" | "accent" | "warn" | "ok" | "bad";

export type MenuItem = {
  label: string;
  onSelect: () => void;
  tone?: MenuItemTone;
  disabled?: boolean;
};

export type MenuProps = {
  /** Rendered inside the trigger button. */
  trigger: ReactNode;
  triggerLabel: string;
  items: MenuItem[];
  /** Optional block above the items — the user menu's identity card. */
  header?: ReactNode;
  align?: "start" | "end";
  triggerClassName?: string;
  className?: string;
};

const TONE: Record<MenuItemTone, string> = {
  default: "text-fg",
  accent: "text-accent",
  warn: "text-warn",
  ok: "text-ok",
  bad: "text-bad",
};

export function Menu({
  trigger,
  triggerLabel,
  items,
  header,
  align = "end",
  triggerClassName,
  className,
}: MenuProps) {
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const entries = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState(false);

  useDismiss(root, open, () => setOpen(false));

  const firstEnabled = items.findIndex((i) => !i.disabled);

  const focusAt = (index: number) => entries.current[index]?.focus();

  const step = (from: number, direction: 1 | -1) =>
    nextEnabled(items.length, from, direction, (i) => Boolean(items[i].disabled));

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      queueMicrotask(() => focusAt(firstEnabled));
    }
  };

  const onItemKeyDown = (index: number, event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(step(index, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(step(index, -1));
    }
  };

  return (
    <div ref={root} className={cx("relative w-fit", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        className={cx(
          "flex cursor-pointer items-center rounded-[7px] border px-2 py-1.5 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          open ? "border-accent-line bg-accent-soft text-accent" : "border-transparent text-muted hover:text-fg",
          triggerClassName,
        )}
      >
        {trigger}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={triggerLabel}
          className={cx(
            "absolute z-10 mt-1 min-w-max rounded-[10px] border border-line-2 bg-panel p-1.5 shadow-elevation",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {header ? (
            <>
              <div className="px-2.5 py-2">{header}</div>
              <div className="my-1.5 h-px bg-line" />
            </>
          ) : null}

          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(el) => {
                entries.current[index] = el;
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
              onKeyDown={(e) => onItemKeyDown(index, e)}
              className={cx(
                "block w-full cursor-pointer rounded-control-sm border-none bg-transparent px-2.5 py-[7px] text-left text-xs transition-colors duration-150 hover:bg-panel-2 focus-visible:bg-panel-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45",
                TONE[item.tone ?? "default"],
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
