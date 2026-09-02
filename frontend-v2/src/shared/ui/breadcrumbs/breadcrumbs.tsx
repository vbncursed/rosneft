import type { ReactNode } from "react";
import { clsx as cx } from "clsx";

export type Crumb = {
  label: ReactNode;
  href?: string;
};

export type BreadcrumbsProps = {
  items: Crumb[];
  className?: string;
};

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol
        className={cx(
          "m-0 flex list-none items-center gap-2 p-0 font-mono text-[11px] text-muted",
        )}
      >
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-2">
              {item.href && !last ? (
                <a href={item.href} className="text-muted no-underline hover:underline">
                  {item.label}
                </a>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "text-fg" : undefined}>
                  {item.label}
                </span>
              )}
              {last ? null : (
                <span aria-hidden="true" className="text-dim">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
