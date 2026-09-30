import { clsx as cx } from "clsx";
import { useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { nextEnabled } from "@/shared/lib/roving";

/** A level, or Auto — the viewer picks the level from the object's size on screen. */
type Choice = number | "auto";

const AUTO_HINT = "Level follows zoom";

export type LodSwitcherProps = {
  levels: number[];
  /** What the reader chose. */
  choice: Choice;
  /** The level actually asked for — the choice, or Auto's pick; null before the canvas reports one. */
  target: number | null;
  /** The level actually on screen — differs from target while it downloads; null when nothing is drawn. */
  shown: number | null;
  onChange: (choice: Choice) => void;
  label?: string;
  className?: string;
};

function nameOf(option: Choice, loading: boolean, onScreen: boolean): string {
  const name = option === "auto" ? "Auto" : `LOD ${option}`;
  if (loading) return `${name}, loading`;
  if (onScreen) return `${name}, on screen`;
  return name;
}

/**
 * The viewport's level picker: `Auto`, then every level. The level being
 * downloaded carries a dot, the level on screen an inset ring — in Auto the
 * ring stays on even when it is the target, so the reader sees what Auto
 * picked. Neither changes a tile's size: the ring is a shadow and the dot sits
 * out of the flow, so the group holds still through a download. The arrows
 * only move focus — every level is a multi-megabyte download, so the choice is
 * Space or Enter, which a focused button turns into a click. The Tab stop
 * follows focus (roving tabindex) and falls back to the chosen tile once focus
 * leaves the group, so the group is always one stop.
 */
export function LodSwitcher({
  levels,
  choice,
  target,
  shown,
  onChange,
  label = "Level of detail",
  className,
}: LodSwitcherProps) {
  const options: Choice[] = ["auto", ...levels];
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const hintId = useId();
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const tabStop = focusIndex ?? options.indexOf(choice);
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocusIndex(null);
  };
  const onKeyDown = (index: number, event: KeyboardEvent) => {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    buttons.current[nextEnabled(options.length, index, direction, () => false, true)]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onBlur={onBlur}
      className={cx("flex gap-1 rounded-[10px] border border-line-2 bg-panel p-1 shadow-elevation", className)}
    >
      {options.map((option, index) => {
        const checked = option === choice;
        const loading = option === target && shown !== target;
        const onScreen = option === shown && !checked;
        return (
          <button
            key={option}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={nameOf(option, loading, onScreen)}
            title={option === "auto" ? AUTO_HINT : undefined}
            aria-describedby={option === "auto" ? hintId : undefined}
            data-shown={onScreen || undefined}
            tabIndex={index === tabStop ? 0 : -1}
            onFocus={() => setFocusIndex(index)}
            onClick={() => onChange(option)}
            onKeyDown={(e) => onKeyDown(index, e)}
            className={cx(
              "relative flex cursor-pointer items-center rounded-[6px] border-none py-1 pl-2.5 pr-[21px] font-mono text-[10px] transition-[color,background-color,box-shadow,scale] duration-150 ease-out active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              checked ? "bg-accent-soft" : "bg-transparent",
              onScreen && "ring-1 ring-inset ring-line-2",
              checked ? "font-semibold text-accent" : onScreen ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {option === "auto" ? "Auto" : `LOD ${option}`}
            {option === "auto" ? (
              <span id={hintId} className="sr-only">
                {AUTO_HINT}
              </span>
            ) : null}
            {/* Every tile reserves the dot's room on the right (21px = 6px gap +
                5px dot + 10px padding), so no phase changes a tile's width. */}
            {loading ? (
              <span
                aria-hidden="true"
                className="absolute right-2.5 top-1/2 size-[5px] -translate-y-1/2 animate-breathe rounded-full bg-accent motion-reduce:animate-none"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
