import { clsx as cx } from "clsx";
import { Button } from "@/shared/ui/button";
import { pageList } from "./pages";

export type PagerProps = {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  /** A page is on its way — every control waits. */
  busy?: boolean;
  /** The navigation landmark's name. */
  label?: string;
};

const CHIP = "inline-flex h-7 min-w-7 items-center justify-center rounded-[6px] px-1 font-mono text-[11px]";

/** Prev, the page chips with gaps, Next — the account feed's pager. */
export function Pager({ page, pageCount, onPage, busy = false, label = "Pages" }: PagerProps) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>
        Prev
      </Button>
      {pageList(page, pageCount).map((item, i) =>
        item === "gap" ? (
          <span key={`gap-${i}`} aria-hidden="true" className={cx(CHIP, "text-muted")}>
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-label={`Page ${item}`}
            aria-current={item === page ? "page" : undefined}
            disabled={busy}
            onClick={() => onPage(item)}
            className={cx(
              CHIP,
              "cursor-pointer border transition-colors duration-150 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              item === page
                ? "border-accent bg-accent-soft font-semibold text-accent"
                : "border-line-2 bg-panel-2 text-fg hover:border-accent-line",
            )}
          >
            {item}
          </button>
        ),
      )}
      <Button size="sm" disabled={busy || page >= pageCount} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </nav>
  );
}
