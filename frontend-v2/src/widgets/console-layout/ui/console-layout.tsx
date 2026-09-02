import type { ReactNode } from "react";
import { ConsoleSidebar } from "@/widgets/console-sidebar";
import type { ConsoleNavItem } from "@/widgets/console-nav";

export type ConsoleLayoutProps = {
  items: ConsoleNavItem[];
  /** Key of the section the current route belongs to. */
  active: string;
  backHref: string;
  viewer: { username: string; roleTitle: string };
  children: ReactNode;
};

/**
 * The shell every console screen sits in: a fixed navigation column and the
 * scrolling content beside it. Applied by the route, so a page renders only
 * its own content and never repeats the chrome.
 */
export function ConsoleLayout({
  items,
  active,
  backHref,
  viewer,
  children,
}: ConsoleLayoutProps) {
  return (
    <div className="grid min-h-dvh grid-cols-[236px_minmax(0,1fr)] bg-bg text-fg">
      <ConsoleSidebar items={items} active={active} backHref={backHref} viewer={viewer} />
      <main className="flex min-w-0 flex-col gap-5 px-9 pb-16 pt-8">{children}</main>
    </div>
  );
}
