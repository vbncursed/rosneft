import { clsx as cx } from "clsx";
import type { ReactNode } from "react";

export type CatalogCardProps = {
  /** Mono overline naming what this is — "Territory", "Model". */
  kind: string;
  title: string;
  description?: string;
  /** Mono identifier on the footer row. */
  slug: string;
  /** Status pill or similar, top right. */
  badge?: ReactNode;
  /** Row actions, top right; replaces the badge when both would collide. */
  actions?: ReactNode;
  /** Footer right — "Open →" by default, or a conversion percentage. */
  trailing?: ReactNode;
  href?: string;
  /** Dims the whole card: nothing to open here yet. */
  muted?: boolean;
  /** Draws the accent border the design uses for hover and selection. */
  highlighted?: boolean;
  className?: string;
};

export function CatalogCard({
  kind,
  title,
  description,
  slug,
  badge,
  actions,
  trailing,
  href,
  muted = false,
  highlighted = false,
  className,
}: CatalogCardProps) {
  return (
    <article
      className={cx(
        "flex flex-col gap-3.5 rounded-card border bg-panel p-5 transition-colors duration-150",
        highlighted ? "border-accent shadow-elevation" : "border-line",
        muted && "opacity-70",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cx(
            "font-mono text-[10px] uppercase tracking-[0.18em]",
            muted ? "text-muted" : "text-accent",
          )}
        >
          {kind}
        </span>
        {actions ?? badge}
      </div>

      <h3 className="m-0 text-[19px] font-semibold tracking-[-0.01em]">
        {href ? (
          // The heading carries the link, not the whole card: the card also
          // holds buttons, and an <a> may not contain them.
          <a href={href} className="text-fg no-underline hover:text-accent hover:underline">
            {title}
          </a>
        ) : (
          title
        )}
      </h3>

      {description ? (
        <p className="m-0 text-[13px] leading-[1.55] text-muted">{description}</p>
      ) : null}

      <div
        className={cx(
          "flex items-center justify-between gap-3 border-t border-line pt-3 font-mono text-[11px]",
          highlighted ? "text-accent" : "text-muted",
        )}
      >
        <span>{slug}</span>
        {trailing ? <span>{trailing}</span> : null}
      </div>
    </article>
  );
}
