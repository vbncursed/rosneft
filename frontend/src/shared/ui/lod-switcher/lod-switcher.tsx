import { clsx as cx } from "clsx";
import { useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { nextEnabled } from "@/shared/lib/roving";

export type LodSwitcherProps = {
  levels: number[];
  /** The level the reader asked for. */
  target: number;
  /** The level actually on screen — differs from target while it downloads; null when nothing is drawn. */
  shown: number | null;
  onChange: (lod: number) => void;
  label?: string;
  className?: string;
};

function nameOf(lod: number, target: number, shown: number | null): string {
  if (lod === target && shown !== target) return `LOD ${lod}, loading`;
  if (lod === shown && shown !== target) return `LOD ${lod}, on screen`;
  return `LOD ${lod}`;
}

/**
 * The viewport's level picker; the loading target carries a dot, the level on
 * screen an inset ring. Neither changes a tile's size: the ring is a shadow and
 * the dot sits out of the flow, so the group holds still through a download.
 * The arrows only move focus — every level is a multi-megabyte download, so the
 * choice is Space or Enter, which a focused button turns into a click. The Tab
 * stop follows focus (roving tabindex) and falls back to the chosen level once
 * focus leaves the group, so the group is always one stop.
 */
export function LodSwitcher({ levels, target, shown, onChange, label = "Level of detail", className }: LodSwitcherProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const tabStop = focusIndex ?? levels.indexOf(target);
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setFocusIndex(null);
  };
  const onKeyDown = (index: number, event: KeyboardEvent) => {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    buttons.current[nextEnabled(levels.length, index, direction, () => false, true)]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onBlur={onBlur}
      className={cx("flex gap-1 rounded-[10px] border border-line-2 bg-panel p-1 shadow-elevation", className)}
    >
      {levels.map((lod, index) => {
        const isTarget = lod === target;
        const loading = isTarget && shown !== target;
        const onScreen = lod === shown && !isTarget;
        return (
          <button
            key={lod}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isTarget}
            aria-label={nameOf(lod, target, shown)}
            data-shown={onScreen || undefined}
            tabIndex={index === tabStop ? 0 : -1}
            onFocus={() => setFocusIndex(index)}
            onClick={() => onChange(lod)}
            onKeyDown={(e) => onKeyDown(index, e)}
            className={cx(
              "relative flex cursor-pointer items-center rounded-[6px] border-none py-1 pl-2.5 pr-[21px] font-mono text-[10px] transition-[color,background-color,box-shadow,scale] duration-150 ease-out active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              isTarget ? "bg-accent-soft" : "bg-transparent",
              onScreen && "ring-1 ring-inset ring-line-2",
              isTarget ? "font-semibold text-accent" : onScreen ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            LOD {lod}
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
