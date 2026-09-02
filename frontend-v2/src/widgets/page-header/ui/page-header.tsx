import type { ReactNode } from "react";

export type PageHeaderProps = {
  /** Mono overline naming the section, e.g. "Territory catalog". */
  eyebrow: string;
  title: string;
  /** The way back up, e.g. { label: "← Home", href: "/" }. */
  back?: { label: string; href: string };
  /** The page's primary action. */
  action?: ReactNode;
};

export function PageHeader({ eyebrow, title, back, action }: PageHeaderProps) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div>
        {back ? (
          <a
            href={back.href}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted no-underline hover:text-fg"
          >
            {back.label}
          </a>
        ) : null}
        <p className="m-0 mt-2.5 font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
          {eyebrow}
        </p>
        <h1 className="m-0 mt-2 text-[28px] font-bold tracking-[-0.02em]">{title}</h1>
      </div>
      {action}
    </header>
  );
}
