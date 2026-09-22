import { cloneElement, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { clsx as cx } from "clsx";
import { placeTooltip, type Side } from "./tooltip-geometry";
import { useTooltip } from "./use-tooltip";

export type TooltipProps = { label: string; shortcut?: string; side?: Side; children: ReactElement };

type Handler = (event: never) => void;
type ChildProps = Record<string, unknown> & { disabled?: boolean; "aria-describedby"?: string };

type TriggerProps = ReturnType<typeof useTooltip>["triggerProps"];
const TRIGGER_EVENTS = ["onPointerEnter", "onPointerLeave", "onPointerDown", "onFocus", "onBlur"] as const;

/** Calls the child's own handler first, then the tooltip's, for every trigger event. */
function mergeHandlers(own: ChildProps, ours: TriggerProps) {
  return Object.fromEntries(
    TRIGGER_EVENTS.map((name) => [
      name,
      (event: never) => {
        (own[name] as Handler | undefined)?.(event);
        (ours[name] as Handler)(event);
      },
    ]),
  );
}

/**
 * Names an icon-only control on hover (after a beat) and on keyboard focus.
 * It lives in the popover top layer, so no `overflow-hidden` panel, stacking
 * context or canvas can clip it. A disabled child gets a wrapper to hover,
 * because a disabled button receives no pointer events.
 */
export function Tooltip({ label, shortcut, side = "top", children }: TooltipProps) {
  const { open, instant, anchor, triggerProps } = useTooltip();
  const id = useId();
  const tip = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);

  const child = children as ReactElement<ChildProps>;

  useLayoutEffect(() => {
    if (!open || !tip.current || !anchor.current) return;
    tip.current.showPopover?.();
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    setPlace(placeTooltip(anchor.current.getBoundingClientRect(), tip.current.getBoundingClientRect(), viewport, side));
  }, [open, side, anchor]);

  const own = child.props["aria-describedby"];
  const described = { "aria-describedby": open ? cx(own, id) : own };

  const trigger = child.props.disabled ? (
    <span className="inline-flex" {...triggerProps}>
      {cloneElement(child, described)}
    </span>
  ) : (
    // No `ref` here: the child keeps its own, and the hook reads the anchor off the event.
    cloneElement(child, { ...mergeHandlers(child.props, triggerProps), ...described })
  );

  // The UA sheet gives `[popover]` `inset: 0; margin: auto` — `inset-auto m-0`
  // undo it, so only the measured `top/left` place it.
  const style: CSSProperties = place ? place : { top: 0, left: 0, visibility: "hidden" };

  return (
    <>
      {trigger}
      {open ? (
        <div
          ref={tip}
          id={id}
          role="tooltip"
          popover="manual"
          style={style}
          className={cx(
            "pointer-events-none fixed inset-auto m-0 inline-flex items-center gap-2 overflow-visible whitespace-nowrap rounded-[6px] border border-line-2 bg-panel-2 px-2 py-1 text-[11px] text-fg shadow-elevation",
            // A 2 px drift away from the trigger, on the asked side: the
            // start style is fixed before the flip is known.
            !instant && "transition-[opacity,translate] duration-120 ease-out starting:opacity-0",
            !instant && (side === "bottom" ? "motion-safe:starting:-translate-y-0.5" : "motion-safe:starting:translate-y-0.5"),
          )}
        >
          {label}
          {shortcut ? (
            <kbd className="rounded-[4px] border border-line-2 px-[5px] py-px font-mono text-[10px] text-muted">
              {shortcut}
            </kbd>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
