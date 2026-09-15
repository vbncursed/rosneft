import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";
import { EXIT_PANORAMA, NOT_CALIBRATED, SHOW_IN } from "../model/copy";

export type PanoramaRowView = {
  id: number;
  title: string;
  /** The equirect photo, or null while there is nothing to show for it. */
  thumbUrl: string | null;
  active: boolean;
  /** An anchor still at the origin cannot be entered; the row says so. */
  calibrated: boolean;
  canEdit: boolean;
  editing: boolean;
};

export type PanoramaRowProps = {
  row: PanoramaRowView;
  onEnter: (id: number) => void;
  onExit: () => void;
  onEdit: (id: number) => void;
};

// 44×34, 40×32 at 1280 and below — Tailwind v4's max-[N] is exclusive.
const THUMB =
  "flex h-[34px] w-11 shrink-0 items-center justify-center overflow-hidden rounded-control-sm border max-[1281px]:h-8 max-[1281px]:w-10";

/** One panorama: its photo, its title, and the way into or out of it. */
export function PanoramaRow({ row, onEnter, onExit, onEdit }: PanoramaRowProps) {
  const { id, title, thumbUrl, active, calibrated, canEdit, editing } = row;
  // Two rows both reading "Show in this panorama" are one control to a screen
  // reader. The visible words stay first, so WCAG 2.5.3 still holds.
  const label = active ? EXIT_PANORAMA : SHOW_IN;

  return (
    <div
      aria-current={editing ? "true" : undefined}
      className={cx(
        "flex items-center gap-2.5 rounded-[9px] border px-2.5 py-[9px]",
        active ? "border-accent bg-accent-soft" : "border-line bg-panel-2",
      )}
    >
      <span className={cx(THUMB, active ? "border-accent-line bg-panel text-accent" : "border-line-2 bg-panel text-dim")}>
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="size-full object-cover" />
        ) : (
          <Icon name="panorama" size={16} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-fg">{title}</span>
        {calibrated ? (
          <button
            type="button"
            onClick={() => (active ? onExit() : onEnter(id))}
            aria-label={`${label}: ${title}`}
            className="mt-1 cursor-pointer border-none bg-transparent p-0 font-mono text-[10px] uppercase tracking-[0.1em] text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            {label}
          </button>
        ) : (
          <span className="mt-1 block font-mono text-[9px] text-muted">{NOT_CALIBRATED}</span>
        )}
      </span>

      {canEdit ? (
        <button
          type="button"
          onClick={() => onEdit(id)}
          aria-label={`Edit ${title}`}
          title={`Edit ${title}`}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-control-sm border border-line-2 bg-panel text-fg transition-colors duration-150 hover:border-accent-line focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          <Icon name="pencil" size={12} />
        </button>
      ) : null}
    </div>
  );
}
