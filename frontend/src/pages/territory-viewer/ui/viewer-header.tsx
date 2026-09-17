import { territoryPath } from "@/entities/territory";
import { Badge } from "@/shared/ui/badge";
import { linkButtonClass } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import type { ViewerHeaderProps } from "../model/page-props";
import { GUEST_SENTENCE, type HeaderPill } from "../model/viewer-view";

const BACK =
  "shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-muted no-underline transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** A neutral reading is the bare ring; the three states are tinted grounds. */
const fillOf = (tone: HeaderPill["tone"]) => (tone === "neutral" ? "outline" : "soft");

/**
 * The bar above the scene: the way back, the territory's name, what state it
 * is in, and the one action a reader who may write it has.
 *
 * The meta line is dropped by the *page* when something else needs the room
 * (a guest's sentence, the measuring pill, a failure) and by CSS at 1280,
 * where the title alone already fills the row.
 */
export function ViewerHeader({ slug, title, pills, meta, guest, canReplace }: ViewerHeaderProps) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-6 border-b border-line bg-panel px-5 py-3.5 max-[1281px]:gap-5 max-[1281px]:px-[18px]">
      <div className="flex min-w-0 items-center gap-4 max-[1281px]:gap-[14px]">
        <a href="/territories" data-tour="catalog-link" className={BACK}>
          ← Territories
        </a>
        <span aria-hidden="true" className="h-[22px] w-px shrink-0 bg-line" />
        <h1 className="m-0 truncate text-[19px] font-semibold tracking-[-0.02em]">{title}</h1>
        {pills.length > 0 ? (
          <span
            role="status"
            aria-label="Scene status"
            className="flex shrink-0 items-center gap-1.5"
          >
            {pills.map((pill) => (
              <Badge key={pill.label} tone={pill.tone} fill={fillOf(pill.tone)} size="status">
                {pill.label}
              </Badge>
            ))}
          </span>
        ) : null}
        {meta ? (
          <span className="shrink-0 font-mono text-[10px] text-muted max-[1281px]:hidden">
            {meta}
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-[9px]">
        {guest ? <span className="font-mono text-[10px] text-muted">{GUEST_SENTENCE}</span> : null}
        {canReplace ? (
          <a href={`${territoryPath(slug)}/replace`} className={linkButtonClass("secondary")}>
            <Icon name="refresh" size={14} className="mr-2" />
            Replace source
          </a>
        ) : null}
      </div>
    </header>
  );
}
