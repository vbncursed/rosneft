import { useState } from "react";
import { clsx as cx } from "clsx";
import { Icon } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";
import { EXIT_PANORAMA, NOT_CALIBRATED, SHOW_IN } from "../model/copy";

export type PanoramaRowView = {
  id: number;
  title: string;
  /** The server-made 256×128 thumbnail; null until it exists, and the row draws the glyph. */
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

/**
 * The photo, or the glyph when it fails (a 404, a refused blob, offline) — never
 * the browser's broken-image mark. A photo off the network fades in; one the
 * cache already holds is complete at mount and shows from the first frame.
 * Keyed on the URL, so a new thumbnail starts over.
 */
function Thumb({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  if (broken) return <Icon name="panorama" size={16} />;
  return (
    // The thumbnail's own size: the box reserves its ratio before the bytes land.
    <img
      ref={(el) => {
        if (el?.complete) setLoaded(true);
      }}
      src={url}
      alt=""
      width={256}
      height={128}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setBroken(true)}
      className={cx("size-full object-cover transition-opacity duration-150 ease-out", !loaded && "opacity-0")}
    />
  );
}

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
        {thumbUrl ? <Thumb key={thumbUrl} url={thumbUrl} /> : <Icon name="panorama" size={16} />}
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
        <Tooltip label={`Edit ${title}`}>
          <button
            type="button"
            onClick={() => onEdit(id)}
            aria-label={`Edit ${title}`}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-control-sm border border-line-2 bg-panel text-fg transition-[color,border-color,scale] duration-150 ease-out hover:border-accent-line active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            <Icon name="pencil" size={12} />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}
