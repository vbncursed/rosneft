import { clsx as cx } from "clsx";
import type { ReactNode } from "react";

export type PageHeaderProps = {
  /** Mono overline naming the section, e.g. "Territory catalog". */
  eyebrow: string;
  title: string;
  /** md the catalog's old 28px title; lg the console screens' 34px; xl the catalog pages' 38px. */
  size?: "md" | "lg" | "xl";
  /** One sentence under the title, where the page needs explaining. */
  description?: ReactNode;
  /** The way back up, e.g. { label: "← Home", href: "/" }. */
  back?: { label: string; href: string };
  /** A status pill beside the title, e.g. the model page's ready/converting/failed. */
  titleBadge?: ReactNode;
  /** The mono line under the title: slug, counts, dates. */
  meta?: string;
  /** The page's primary action. */
  action?: ReactNode;
};

const TITLE: Record<NonNullable<PageHeaderProps["size"]>, string> = {
  md: "mt-2 text-[28px] tracking-[-0.02em]",
  lg: "mt-2.5 text-[34px] tracking-[-0.025em]",
  xl: "mt-2.5 text-[38px] tracking-[-0.03em] leading-[1.05]",
};

const DESCRIPTION_WIDTH: Record<NonNullable<PageHeaderProps["size"]>, string | false> = {
  md: false,
  lg: "max-w-[56ch] leading-relaxed",
  xl: "max-w-[52ch] leading-relaxed",
};

export function PageHeader({
  eyebrow,
  title,
  size = "md",
  description,
  back,
  titleBadge,
  meta,
  action,
}: PageHeaderProps) {
  return (
    <header className={cx("flex justify-between gap-6", size === "md" ? "items-end" : "items-start")}>
      <div>
        {back ? (
          <a
            href={back.href}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted no-underline hover:text-fg"
          >
            {back.label}
          </a>
        ) : null}
        <p
          className={cx(
            "m-0 font-mono text-[10px] uppercase text-accent",
            back && (size === "md" ? "mt-2.5" : "mt-4"),
            size === "md" ? "tracking-[0.22em]" : "tracking-[0.24em]",
          )}
        >
          {eyebrow}
        </p>
        {titleBadge ? (
          <div className="flex flex-wrap items-center gap-[11px]">
            <h1 className={cx("m-0 font-bold", TITLE[size])}>{title}</h1>
            {titleBadge}
          </div>
        ) : (
          <h1 className={cx("m-0 font-bold", TITLE[size])}>{title}</h1>
        )}
        {meta ? <p className="m-0 mt-2 font-mono text-[11px] text-muted">{meta}</p> : null}
        {description ? (
          <p className={cx("m-0 mt-2 text-[13px] text-muted", DESCRIPTION_WIDTH[size])}>
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </header>
  );
}
