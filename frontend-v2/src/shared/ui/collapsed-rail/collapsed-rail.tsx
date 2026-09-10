import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";

export type CollapsedRailProps = {
  /** The vertical overline, e.g. "Overlays". */
  label: string;
  /** The vertical pill, e.g. "4 placed"; omitted, no pill. */
  badge?: string;
  /** The expand button's accessible name — unique on screen. */
  expandName: string;
  onExpand: () => void;
  className?: string;
};

/** The 44px strip a collapsed side panel folds into: a way back, a name, a count. */
export function CollapsedRail({ label, badge, expandName, onExpand, className }: CollapsedRailProps) {
  return (
    <div
      className={cx(
        "flex w-11 flex-col items-center gap-3 rounded-card border border-line bg-panel py-2.5 shadow-elevation",
        className,
      )}
    >
      <button
        type="button"
        onClick={onExpand}
        aria-label={expandName}
        title={expandName}
        className="flex size-7 cursor-pointer items-center justify-center rounded-[8px] border border-line-2 bg-panel-2 text-fg transition-colors duration-150 hover:border-accent-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Icon name="chevron-left" size={13} />
      </button>
      <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted [writing-mode:vertical-rl]">{label}</span>
      {badge ? (
        <span className="rounded-full border border-line-2 bg-panel-2 px-[3px] py-[7px] font-mono text-[9px] text-fg [writing-mode:vertical-rl]">
          {badge}
        </span>
      ) : null}
    </div>
  );
}
