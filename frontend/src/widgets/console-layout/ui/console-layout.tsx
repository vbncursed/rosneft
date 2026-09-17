import type { ReactNode } from "react";
import { ConsoleSidebar } from "@/widgets/console-sidebar";
import type { ConsoleNavItem } from "@/widgets/console-nav";

import type { Viewer } from "@/shared/session";
export type ConsoleLayoutProps = {
  items: ConsoleNavItem[];
  /** Key of the section the current route belongs to. */
  active: string;
  backHref: string;
  viewer: Viewer;
  children: ReactNode;
};

/**
 * The shell every console screen sits in: a fixed navigation column and the
 * scrolling content beside it. Applied by the route, so a page renders only
 * its own content and never repeats the chrome.
 *
 * Below lg the column is a strip above the content — at 400px a fixed 236px
 * column left the page 164px and scrolled it sideways.
 */
export function ConsoleLayout({
  items,
  active,
  backHref,
  viewer,
  children,
}: ConsoleLayoutProps) {
  return (
    <div className="grid min-h-dvh grid-cols-1 bg-bg text-fg lg:grid-cols-[236px_minmax(0,1fr)]">
      <ConsoleSidebar items={items} active={active} backHref={backHref} viewer={viewer} />
      <main className="flex min-w-0 flex-col gap-5 px-4 pb-16 pt-8 lg:px-9">{children}</main>
    </div>
  );
}
