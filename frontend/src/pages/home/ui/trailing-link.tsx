import type { ReactNode } from "react";

export type TrailingLinkProps = { href: string; children: ReactNode };

/** The mono, uppercase link after a section heading's rule — "See all 12 territories →". */
export function TrailingLink({ href, children }: TrailingLinkProps) {
  return (
    <a
      href={href}
      className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent no-underline hover:underline"
    >
      {children}
    </a>
  );
}
