import { clsx as cx } from "clsx";
import type { ReactNode } from "react";

export type ToolRailItem = {
  key: string;
  /** A mono glyph or an <Icon>. */
  glyph: ReactNode;
  /** The accessible name and the title — unique on screen. */
  name: string;
  /** inert: drawn dim and unclickable, kept in place so the rail never shifts. */
  state?: "active" | "idle" | "inert";
  onClick?: () => void;
};

export type ToolRailProps = { tools: ToolRailItem[]; label: string; className?: string };

const TILE: Record<NonNullable<ToolRailItem["state"]>, string> = {
  active: "bg-accent-soft text-accent",
  idle: "cursor-pointer bg-transparent text-muted hover:text-fg",
  inert: "cursor-default bg-transparent text-dim",
};

/** The viewport's 30px tool tiles in a 4px panel — one glyph, one name each. */
export function ToolRail({ tools, label, className }: ToolRailProps) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={cx("flex gap-1 rounded-[10px] border border-line-2 bg-panel p-1 shadow-elevation", className)}
    >
      {tools.map(({ key, glyph, name, state = "idle", onClick }) => (
        <button
          key={key}
          type="button"
          title={name}
          aria-label={name}
          aria-pressed={state === "active"}
          aria-disabled={state === "inert" || undefined}
          onClick={state === "inert" ? undefined : onClick}
          className={cx(
            "flex size-[30px] items-center justify-center rounded-[7px] border-none font-mono text-[12px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
            TILE[state],
          )}
        >
          {glyph}
        </button>
      ))}
    </div>
  );
}
