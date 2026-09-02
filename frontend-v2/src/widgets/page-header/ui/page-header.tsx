import { clsx as cx } from "clsx";
import type { ReactNode } from "react";

export type PageHeaderProps = {
  /** Mono overline naming the section, e.g. "Territory catalog". */
  eyebrow: string;
  title: string;
  /** lg is the console screens' 34px title; md the catalog's 28px. */
  size?: "md" | "lg";
  /** The way back up, e.g. { label: "← Home", href: "/" }. */
  back?: { label: string; href: string };
  /** The page's primary action. */
  action?: ReactNode;
};

export function PageHeader({ eyebrow, title, size = "md", back, action }: PageHeaderProps) {
  return (
    <header
      className={cx(
        "flex justify-between gap-6",
        size === "lg" ? "items-start" : "items-end",
      )}
    >
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
            back ? "mt-2.5" : "",
            size === "lg" ? "tracking-[0.24em]" : "tracking-[0.22em]",
          )}
        >
          {eyebrow}
        </p>
        <h1
          className={cx(
            "m-0 font-bold",
            size === "lg"
              ? "mt-2.5 text-[34px] tracking-[-0.025em]"
              : "mt-2 text-[28px] tracking-[-0.02em]",
          )}
        >
          {title}
        </h1>
      </div>
      {action}
    </header>
  );
}
