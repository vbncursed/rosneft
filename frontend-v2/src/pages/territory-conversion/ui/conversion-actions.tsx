import type { Phase } from "../model/conversion-view";

export type ConversionActionsProps = {
  phase: Phase;
  slug: string;
  hasLod0: boolean;
  onOpenViewer: () => void;
};

export const FAILED_NOTE =
  "A failed job cannot be restarted on its own — conversion begins again when a new archive is uploaded for this territory.";

// The same focus ring and hover pairs shared/ui/button uses: these are links
// and buttons the user tabs to, and a mixed set that behaves two ways is worse
// than either. One property per state, so the hovers do not collide with the
// resting border/background above.
const CONTROL =
  "inline-flex cursor-pointer items-center rounded-control border px-[18px] py-2.5 text-[13px] no-underline transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const PRIMARY = `${CONTROL} border-accent bg-accent font-semibold text-accent-fg hover:bg-accent/90`;
const SECONDARY = `${CONTROL} border-line-2 bg-panel-2 font-medium text-fg hover:border-accent-line`;

/** The way forward after a failure or a finish; nothing while the job is still going. */
export function ConversionActions({ phase, slug, hasLod0, onOpenViewer }: ConversionActionsProps) {
  if (phase === "failed") {
    return (
      <>
        <div className="flex flex-wrap gap-[9px]">
          <a href={`/territories/${encodeURIComponent(slug)}/replace`} className={PRIMARY}>
            Upload a new source
          </a>
          <a href="/territories" className={SECONDARY}>
            Back to catalog
          </a>
          {hasLod0 ? (
            <button type="button" onClick={onOpenViewer} className={SECONDARY}>
              Open the current viewer
            </button>
          ) : null}
        </div>
        <p className="m-0 max-w-[60ch] text-[11px] leading-[1.55] text-muted">{FAILED_NOTE}</p>
      </>
    );
  }
  if (phase === "ready") {
    return (
      <div className="flex flex-wrap gap-[9px]">
        <button type="button" onClick={onOpenViewer} className={PRIMARY}>
          Open the viewer
        </button>
        <a href="/territories" className={SECONDARY}>
          Back to catalog
        </a>
      </div>
    );
  }
  return null;
}
