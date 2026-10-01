import type { ReactNode } from "react";

export type CatalogShellProps = {
  children: ReactNode;
  /**
   * page — the catalog screens: a padded document-flow column.
   * viewport — the territory viewer: a full-height flex column with no
   * padding, so the scene and its absolutely-positioned overlays own the
   * whole window under the page's own top bar.
   */
  layout?: "page" | "viewport";
};

const MAIN: Record<NonNullable<CatalogShellProps["layout"]>, string> = {
  page: "flex min-h-[calc(100dvh-var(--offline-h))] min-w-0 flex-col gap-[22px] px-9 pb-[72px] pt-8",
  viewport: "flex h-[calc(100dvh-var(--offline-h))] min-w-0 flex-col overflow-hidden",
};

/**
 * Heights are a window minus --offline-h (index.css: 0 online, the offline
 * banner's height while it is up), so banner + shell is still exactly one window.
 *
 * The chrome around the catalog screens and the viewer: unlike the console,
 * there is no sidebar — the page header carries its own back link and action.
 */
export function CatalogShell({ children, layout = "page" }: CatalogShellProps) {
  return (
    // data-fullbleed opts the viewer out of index.css's reserved scrollbar lane.
    <div className="min-h-[calc(100dvh-var(--offline-h))] bg-bg text-fg" data-fullbleed={layout === "viewport" || undefined}>
      <main className={MAIN[layout]}>{children}</main>
    </div>
  );
}
