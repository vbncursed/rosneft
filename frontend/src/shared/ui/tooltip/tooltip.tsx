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

/** theme.css `--ease-out`: WAAPI cannot read a Tailwind token. */
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const ENTER_MS = 120;

// 2 px away from the trigger, on the side it actually took — only known after
// measuring, which is why this is WAAPI and not `@starting-style`. Reduced
// motion keeps the fade and drops the drift.
function driftIn(el: HTMLElement, side: Side) {
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const from = still ? "0 0" : `0 ${side === "top" ? 2 : -2}px`;
  el.animate?.([{ opacity: 0, translate: from }, { opacity: 1, translate: "0 0" }], {
    duration: ENTER_MS,
    easing: EASE_OUT,
  });
}

/**
 * Names an icon-only control on hover (after a beat) and on keyboard focus.
 * It lives in the popover top layer, so no `overflow-hidden` panel, stacking
 * context or canvas can clip it. A long label wraps inside 20rem (and the
 * viewport less its 8 px edges); placement measures it after it has wrapped.
 */
export function Tooltip({ label, shortcut, side = "top", children }: TooltipProps) {
  const { open, instant, anchor, triggerProps } = useTooltip();
  const id = useId();
  const tip = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);

  const child = children as ReactElement<ChildProps>;

  // Calling showPopover on a popover already showing throws; open it once.
  useLayoutEffect(() => {
    if (open) tip.current?.showPopover?.();
  }, [open]);

  // Measured again whenever the text changes, so a toggle's new label cannot
  // overrun the edge; the drift plays only on the measure that opened it.
  const entered = useRef(false);
  useLayoutEffect(() => {
    if (!open) entered.current = false;
    if (!open || !tip.current || !anchor.current) return;
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const placed = placeTooltip(anchor.current.getBoundingClientRect(), tip.current.getBoundingClientRect(), viewport, side);
    setPlace(placed);
    if (entered.current) return;
    entered.current = true;
    if (!instant) driftIn(tip.current, placed.side);
  }, [open, instant, side, anchor, label, shortcut]);

  const own = child.props["aria-describedby"];
  const described = { "aria-describedby": open ? cx(own, id) : own };

  // One span, always, so flipping `disabled` never remounts the child (and drops
  // its focus). A disabled child gets no pointer events, so the span takes the
  // hover then; otherwise it is `contents` — no box, no hover — and the child
  // takes the handlers. No `ref`: the child keeps its own.
  const disabled = Boolean(child.props.disabled);
  const trigger = (
    <span className={disabled ? "inline-flex" : "contents"} {...(disabled ? triggerProps : {})}>
      {cloneElement(child, disabled ? described : { ...mergeHandlers(child.props, triggerProps), ...described })}
    </span>
  );

  // The UA sheet gives `[popover]` `inset: 0; margin: auto` — `inset-auto m-0`
  // undo it, so only the measured `top/left` place it. `w-max` under the cap:
  // a fixed box shrink-wraps to the room right of its `left`, so without it a
  // tip placed near the right edge re-wrapped narrower than it was measured.
  const style: CSSProperties = place ? { top: place.top, left: place.left } : { top: 0, left: 0, visibility: "hidden" };

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
          className="pointer-events-none fixed inset-auto m-0 inline-flex items-center gap-2 w-max max-w-[min(20rem,calc(100vw-16px))] overflow-visible rounded-[6px] border border-line-2 bg-panel-2 px-2 py-1 text-[11px] leading-4 text-fg shadow-elevation"
        >
          {label}
          {shortcut ? (
            <kbd className="rounded-[4px] border border-line-2 px-[5px] py-px font-mono text-[10px] leading-3 text-muted">
              {shortcut}
            </kbd>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
