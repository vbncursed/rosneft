import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";
import { EXIT_PANORAMA, NOT_CALIBRATED, SHOW_IN } from "../model/copy";

export type PanoramaRowView = {
  id: number;
  title: string;
  /** The equirect photo, or null while there is nothing to show for it. */
  thumbUrl: string | null;
  active: boolean;
  /** An anchor still at the origin: the row says so, above the way in. */
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
  "flex h-[34px] w-11 shrink-0 items-center justify-center overflow-hidden rounded-control-sm border bg-panel max-[1281px]:h-8 max-[1281px]:w-10";

/** One panorama: its photo, its title, and the way into or out of it. */
export function PanoramaRow({ row, onEnter, onExit, onEdit }: PanoramaRowProps) {
  const { id, title, thumbUrl, active, calibrated, canEdit, editing } = row;
  // Two rows both reading "Show in this panorama" are one control to a screen
  // reader. The visible words stay first, so WCAG 2.5.3 still holds.
  const label = active ? EXIT_PANORAMA : SHOW_IN;
  const hintId = `panorama-${id}-uncalibrated`;

  return (
    <div
      aria-current={editing ? "true" : undefined}
      className={cx(
        "flex items-center gap-2.5 rounded-[9px] border px-2.5 py-[9px]",
        active ? "border-accent bg-accent-soft" : "border-line bg-panel-2",
      )}
    >
      <span className={cx(THUMB, active ? "border-accent-line text-accent" : "border-line-2 text-dim")}>
        {thumbUrl ? (
          // ponytail: the full equirect (4096x2048, 5-8 MB) for a 44x34 thumb.
          // `lazy` keeps a capture the reader never scrolls to off the wire
          // and `async` keeps the decode off the main thread; the ceiling is a
          // server-side thumbnail, which is a gateway endpoint away.
          <img src={thumbUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
        ) : (
          <Icon name="panorama" size={16} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-fg">{title}</span>
        {/* The hint warns, it does not lock the door (user request,
            2026-09-16): an anchor at the origin is still a place to stand, and
            an alignment can only be judged from inside the photograph. */}
        {calibrated ? null : (
          <span id={hintId} className="mt-1 block font-mono text-[9px] text-muted">
            {NOT_CALIBRATED}
          </span>
        )}
        <button
          type="button"
          onClick={() => (active ? onExit() : onEnter(id))}
          aria-label={`${label}: ${title}`}
          // Sighted readers get the warning from proximity; a screen reader on
          // the button hears only the label unless it points at the hint.
          aria-describedby={calibrated ? undefined : hintId}
          className="mt-1 cursor-pointer border-none bg-transparent p-0 font-mono text-[10px] uppercase tracking-[0.1em] text-accent transition-[color,scale] duration-150 ease-out active:scale-[0.97] hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          {label}
        </button>
      </span>

      {canEdit ? (
        <button
          type="button"
          onClick={() => onEdit(id)}
          aria-label={`Edit ${title}`}
          title={`Edit ${title}`}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-control-sm border border-line-2 bg-panel text-fg transition-[color,border-color,scale] duration-150 ease-out hover:border-accent-line active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          <Icon name="pencil" size={12} />
        </button>
      ) : null}
    </div>
  );
}
