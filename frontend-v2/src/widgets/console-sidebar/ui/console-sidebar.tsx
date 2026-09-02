import { ThemeToggle } from "@/features/theme-toggle";
import { Avatar } from "@/shared/ui/avatar";
import { ConsoleNav, type ConsoleNavItem } from "@/widgets/console-nav";

export type ConsoleSidebarProps = {
  items: ConsoleNavItem[];
  /** Key of the section currently open. */
  active: string;
  backHref: string;
  /** Signed-in identity, shown at the foot of the column. */
  viewer: { username: string; roleTitle: string };
  /** Single letter in the brand mark. */
  mark?: string;
};

export function ConsoleSidebar({
  items,
  active,
  backHref,
  viewer,
  mark = "A",
}: ConsoleSidebarProps) {
  return (
    // Not an <aside>: the column is the console's primary navigation, and the
    // <nav> inside already carries that landmark. A second complementary
    // region here competes with the person inspector for the same role.
    //
    // Two elements, and both are needed. The outer one is a plain grid item,
    // so it stretches to the full height of the document and the panel fill
    // reaches the bottom of a long page. The inner one is the viewport-tall
    // sticky, so the contents hold their place while the page scrolls past.
    <div className="border-r border-line bg-panel">
      <div className="sticky top-0 flex h-dvh flex-col gap-5.5 overflow-hidden px-4.5 py-6">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-control bg-accent text-[13px] font-bold text-accent-fg"
          >
            {mark}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            Console
          </span>
        </div>

        <ConsoleNav
          items={items}
          active={active}
          backHref={backHref}
          className="min-h-0 overflow-y-auto"
        />

        <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
          <ThemeToggle />
          <div className="flex items-center gap-2.5">
            <Avatar name={viewer.username} size={32} />
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-xs font-medium text-fg">
                {viewer.username}
              </p>
              <p className="m-0 mt-px truncate text-[10px] text-dim">
                {viewer.roleTitle}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
