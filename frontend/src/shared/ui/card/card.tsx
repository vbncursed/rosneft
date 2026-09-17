import type { HTMLAttributes, ReactNode } from "react";
import { clsx as cx } from "clsx";

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  /** Right-aligned controls on the header row. */
  actions?: ReactNode;
  /** Mono overline above the body, used all over the design system. */
  overline?: ReactNode;
  /** Off when the body draws its own edge-to-edge content, e.g. a table. */
  padded?: boolean;
};

export function Card({
  title,
  actions,
  overline,
  padded = true,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cx(
        "rounded-card border border-line bg-panel text-fg",
        !title && !actions && padded && "p-5",
        (title || actions) && "overflow-hidden",
        className,
      )}
      {...rest}
    >
      {title || actions ? (
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          {title ? <p className="m-0 text-[15px] font-semibold">{title}</p> : <span />}
          {actions}
        </div>
      ) : null}

      {overline ? (
        <p
          className={cx(
            "m-0 font-mono text-[10px] uppercase tracking-[0.2em] text-muted",
            title || actions ? "px-5 pt-4" : "",
          )}
        >
          {overline}
        </p>
      ) : null}

      {(title || actions) && padded ? <div className="p-5">{children}</div> : children}
    </div>
  );
}
