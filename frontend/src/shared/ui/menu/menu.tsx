import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { clsx as cx } from "clsx";
import { nextEnabled } from "@/shared/lib/roving";
import { useDismiss } from "@/shared/lib/use-dismiss";
import { Tooltip } from "@/shared/ui/tooltip";

export type MenuItemTone = "default" | "accent" | "warn" | "ok" | "bad";

export type MenuItem = {
  /** Keys the item where two may share a label — a group title is the reader's own words. */
  id?: string;
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
  /** Replaces the trigger's own look (border, padding, colours, press scale); the focus ring stays. */
  triggerClassName?: string;
  /** `false` when the trigger shows its own text — the tooltip would only repeat it. */
  triggerTooltip?: false;
  /** Greys the trigger while something it would act on is busy; the menu cannot open. */
  disabled?: boolean;
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
  triggerTooltip,
  disabled,
  className,
}: MenuProps) {
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const entries = useRef<(HTMLButtonElement | null)[]>([]);
  const [open, setOpen] = useState(false);

  // The focused action leaves the DOM with the menu; hand focus back first or
  // it falls to <body>. On an outside pointer this runs at pointerdown, before
  // mousedown moves focus: focus moves to the trigger first; the pointer's
  // mousedown then takes it where it wanted.
  const close = () => {
    if (root.current?.contains(document.activeElement)) button.current?.focus();
    setOpen(false);
  };

  useDismiss(root, open, close);

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

  const triggerButton = (
    <button
      ref={button}
      type="button"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? menuId : undefined}
      aria-label={triggerLabel}
      disabled={disabled}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={onTriggerKeyDown}
      className={cx(
        "flex cursor-pointer items-center disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        triggerClassName ??
          cx(
            "rounded-[7px] border px-2 py-1.5 transition-[color,background-color,border-color,scale] duration-150 ease-out enabled:active:scale-[0.95]",
            open ? "border-accent-line bg-accent-soft text-accent" : "border-transparent text-muted enabled:hover:text-fg",
          ),
      )}
    >
      {trigger}
    </button>
  );

  return (
    <div ref={root} className={cx("relative w-fit", className)}>
      {triggerTooltip === false ? triggerButton : <Tooltip label={triggerLabel}>{triggerButton}</Tooltip>}

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={triggerLabel}
          className={cx(
            // Grows out of the trigger's corner; leaving is instant (unmount).
            "absolute z-10 mt-1 min-w-max rounded-[10px] border border-line-2 bg-panel p-1.5 shadow-elevation transition-[opacity,scale] duration-180 ease-out starting:opacity-0 motion-safe:starting:scale-[0.97]",
            align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left",
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
              key={item.id ?? item.label}
              ref={(el) => {
                entries.current[index] = el;
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
              onKeyDown={(e) => onItemKeyDown(index, e)}
              className={cx(
                "block w-full cursor-pointer rounded-control-sm border-none bg-transparent px-2.5 py-[7px] text-left text-xs transition-[background-color,scale] duration-150 ease-out enabled:hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45",
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
