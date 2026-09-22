import { clsx as cx } from "clsx";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";

export type SectionHeadProps = {
  overline: string;
  /** Mono note on the right — `2`, or `PDF overlays · 2`. */
  count: string;
  /** The 24×24 upload button, drawn only for a reader who may add one. */
  upload?: { title: string; tourId: string; onClick: () => void };
  /** Makes the head the toggle of the list `controls` names. */
  fold?: { open: boolean; locked: boolean; onToggle: () => void; controls: string };
};

const OVERLINE = "font-mono text-[9px] uppercase tracking-[0.2em] text-muted";
const COUNT = "font-mono text-[10px] text-muted";

/**
 * A panel section's own head: what it lists, how many, and the way to add one.
 *
 * With `fold` the overline and count become one button that opens the list,
 * like a model group on the Placements tab. The upload button stays its
 * sibling — a button inside a button is invalid, and it must not fold anything.
 */
export function SectionHead({ overline, count, upload, fold }: SectionHeadProps) {
  return (
    <div className="flex items-center justify-between gap-2.5">
      {fold ? (
        <button
          type="button"
          onClick={fold.locked ? undefined : fold.onToggle}
          aria-expanded={fold.open}
          aria-controls={fold.controls}
          // Held open by the page: still focusable and announced, not pressable.
          aria-disabled={fold.locked || undefined}
          className={cx(
            "group flex min-w-0 flex-1 items-center justify-between gap-2 rounded-[4px] border-none bg-transparent p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
            fold.locked
              ? "cursor-default"
              : "cursor-pointer transition-[scale] duration-150 ease-out active:scale-[0.99]",
          )}
        >
          <span className={cx(OVERLINE, "group-hover:text-fg")}>{overline}</span>
          <span className="flex items-center gap-2">
            <span className={COUNT}>{count}</span>
            <Icon
              name="chevron-right"
              size={12}
              className={cx(
                "shrink-0 text-muted transition-transform duration-150 ease-out motion-reduce:transition-none group-hover:text-fg",
                fold.open && "rotate-90",
              )}
            />
          </span>
        </button>
      ) : (
        <>
          <span className={OVERLINE}>{overline}</span>
          {/* Keeps the count and the button together on the right. */}
          <span className="flex-1" />
          <span className={COUNT}>{count}</span>
        </>
      )}
      {upload ? (
        <Button
          shape="icon"
          size="xs"
          onClick={upload.onClick}
          aria-label={upload.title}
          data-tour={upload.tourId}
        >
          <Icon name="arrow-up" size={12} />
        </Button>
      ) : null}
    </div>
  );
}
