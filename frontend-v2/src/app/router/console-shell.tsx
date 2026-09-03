import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { meQuery } from "@/entities/user";
import { ConsoleLayout } from "@/widgets/console-layout";
import { Toaster } from "@/widgets/toaster";
import { activeSection, consoleNav, isConsoleHref, viewerOf } from "./guard";

/**
 * The chrome around every console screen, applied once here so no page draws
 * it. The principal is already in the cache — consoleRoute's loader awaited
 * it — so the null branch is a stale-cache edge, not a loading state.
 *
 * Clicks on console links are handed to the router: ConsoleNav renders plain
 * anchors so it stays router-agnostic and browsable in Cosmos, and a full
 * reload per click would throw away the query cache for nothing.
 */
export function ConsoleShell() {
  const { data: me } = useQuery(meQuery);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (!me) return null;

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const href = (event.target as HTMLElement).closest("a")?.getAttribute("href");
    if (!href || !isConsoleHref(href) || event.metaKey || event.ctrlKey || event.button !== 0) return;
    event.preventDefault();
    void navigate({ href });
  };

  return (
    // role="presentation": the wrapper exists for the click delegate only and
    // adds nothing to the accessibility tree.
    <div role="presentation" onClickCapture={onClickCapture}>
      <ConsoleLayout
        items={consoleNav(me)}
        active={activeSection(pathname)}
        backHref="/"
        viewer={viewerOf(me)}
      >
        <Outlet />
      </ConsoleLayout>
      <Toaster />
    </div>
  );
}
