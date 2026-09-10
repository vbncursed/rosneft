import { clsx as cx } from "clsx";
import { useRef, type KeyboardEvent } from "react";
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

/** The viewport's level picker; the loading target carries a dot, the level on screen an outline. */
export function LodSwitcher({ levels, target, shown, onChange, label = "Level of detail", className }: LodSwitcherProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (index: number, event: KeyboardEvent) => {
    const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const next = nextEnabled(levels.length, index, direction, () => false, true);
    onChange(levels[next]);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
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
            tabIndex={isTarget ? 0 : -1}
            onClick={() => onChange(lod)}
            onKeyDown={(e) => onKeyDown(index, e)}
            className={cx(
              "flex cursor-pointer items-center gap-1.5 rounded-[6px] px-2.5 py-1 font-mono text-[10px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
              isTarget ? "bg-accent-soft" : "bg-transparent",
              onScreen ? "border border-line-2" : "border-none",
              isTarget ? "font-semibold text-accent" : onScreen ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            LOD {lod}
            {loading ? <span aria-hidden="true" className="size-[5px] rounded-full bg-accent" /> : null}
          </button>
        );
      })}
    </div>
  );
}
