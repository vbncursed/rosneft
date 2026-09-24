import type { ReactNode } from "react";
import { ThemeToggle } from "@/features/theme-toggle";

export type StandaloneHeaderProps = {
  /** Where the brand leads; plain text without it (the gate has nowhere to send you). */
  brandHref?: string;
  /** Drawn after the theme toggle — the gate's identity chip. */
  children?: ReactNode;
};

const BRAND = "font-mono text-[10px] uppercase tracking-[0.24em] text-accent";

/**
 * The header of a page that sits outside every shell — the 404 and the
 * two-factor gate: the brand on the left, the theme toggle on the right.
 */
export function StandaloneHeader({ brandHref, children }: StandaloneHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-5">
      {brandHref ? (
        <a href={brandHref} className={`${BRAND} no-underline hover:underline`}>
          Andrey Viewer
        </a>
      ) : (
        <span className={BRAND}>Andrey Viewer</span>
      )}
      <div className="flex flex-wrap items-center gap-[9px]">
        <ThemeToggle variant="compact" />
        {children}
      </div>
    </header>
  );
}
