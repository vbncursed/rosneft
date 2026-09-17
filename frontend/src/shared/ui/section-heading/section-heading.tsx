import { clsx as cx } from "clsx";
import type { ReactNode } from "react";

export type SectionHeadingProps = {
  title: ReactNode;
  /** Mono note beside the title, e.g. "11 people" or "312 events". */
  count?: ReactNode;
  /** Heading level — pick the one that fits the page outline. */
  as?: "h2" | "h3";
  /** After the rule: the section's one link, e.g. "See all 12 territories →". */
  trailing?: ReactNode;
  className?: string;
};

/** A title, an optional count, a rule filling the rest of the line, and an optional link after it. */
export function SectionHeading({ title, count, as: Tag = "h2", trailing, className }: SectionHeadingProps) {
  return (
    <div className={cx("flex flex-wrap items-center gap-3", className)}>
      <Tag className="m-0 text-[13px] font-semibold text-fg">{title}</Tag>
      {count !== undefined ? <span className="font-mono text-[10px] text-dim">{count}</span> : null}
      <span aria-hidden="true" className="h-px min-w-5 flex-1 bg-line" />
      {trailing}
    </div>
  );
}
