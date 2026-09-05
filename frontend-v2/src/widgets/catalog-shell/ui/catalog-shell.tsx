import type { ReactNode } from "react";

export type CatalogShellProps = { children: ReactNode };

/**
 * The chrome around the four catalog screens (/territories, /territories/new,
 * /models, /models/new): unlike the console, there is no sidebar — the page
 * header carries its own back link and primary action.
 */
export function CatalogShell({ children }: CatalogShellProps) {
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <main className="flex min-w-0 flex-col gap-[22px] px-9 pb-[72px] pt-8">{children}</main>
    </div>
  );
}
