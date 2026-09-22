import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";

export type SectionHeadProps = {
  overline: string;
  /** Mono note on the right — `2`, or `PDF overlays · 2`. */
  count: string;
  /** The 24×24 upload button, drawn only for a reader who may add one. */
  upload?: { title: string; tourId: string; onClick: () => void };
};

/** A panel section's own head: what it lists, how many, and the way to add one. */
export function SectionHead({ overline, count, upload }: SectionHeadProps) {
  return (
    <div className="flex items-center justify-between gap-2.5">
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">{overline}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted">{count}</span>
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
      </span>
    </div>
  );
}
