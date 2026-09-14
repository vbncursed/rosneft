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
  /**
   * A mode tile: `active` means "this mode is on", so it carries `aria-pressed`.
   * A momentary action (Reset camera, Replay tour) is lit while it is the live
   * one, which is not a pressed state — announcing it as a toggle says the
   * camera stays reset.
   */
  toggle?: boolean;
  onClick?: () => void;
  /**
   * The onboarding tour's anchor, emitted as `data-tour` on the tile. It has to
   * sit on the button itself — the overlay measures the element it finds and
   * draws its halo around that rect, so a wrapper would light the whole rail.
   */
  dataTour?: string;
};

export type ToolRailProps = { tools: ToolRailItem[]; label: string; className?: string };

const TILE: Record<NonNullable<ToolRailItem["state"]>, string> = {
  active: "cursor-pointer bg-accent-soft text-accent",
  idle: "cursor-pointer bg-transparent text-muted hover:text-fg",
  inert: "cursor-default bg-transparent text-dim",
};

/** The viewport's 30px tool tiles in a 4px panel — one glyph, one name each. */
export function ToolRail({ tools, label, className }: ToolRailProps) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      // inline-flex: the rail is as wide as its tiles. As a block it spanned
      // its container, and only its parent being a flex column hid that.
      className={cx("inline-flex gap-1 rounded-[10px] border border-line-2 bg-panel p-1 shadow-elevation", className)}
    >
      {tools.map(({ key, glyph, name, state = "idle", toggle, onClick, dataTour }) => (
        <button
          key={key}
          type="button"
          data-tour={dataTour}
          title={name}
          aria-label={name}
          aria-pressed={toggle ? state === "active" : undefined}
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
