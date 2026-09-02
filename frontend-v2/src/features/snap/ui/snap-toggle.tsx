import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";

export type SnapToggleProps = {
  on: boolean;
  onToggle: () => void;
};

/** Drops a dragged placement onto the surface under it. `G` does the same. */
export function SnapToggle({ on, onToggle }: SnapToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={cx(
        "flex w-full cursor-pointer items-center justify-between gap-2 rounded-control border px-3 py-2 text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        on ? "border-ok bg-ok-soft text-ok" : "border-line-2 bg-panel-2 text-muted",
      )}
    >
      <span className="flex items-center gap-2">
        <Icon name="magnet" size={14} />
        Snap to surface · {on ? "on" : "off"}
      </span>
      <kbd
        aria-hidden="true"
        className={cx("rounded-[3px] border px-1.5 font-mono text-[10px]", on ? "border-ok" : "border-line-2")}
      >
        G
      </kbd>
    </button>
  );
}
