import type { ReactNode } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";

/**
 * The three dead ends a router can reach. Their own file because the route
 * tree exports consts, and a component beside a const costs fast refresh
 * (react/only-export-components) — the same reason `login-route.tsx` is split
 * out.
 *
 * Deliberately plain: one panel, the app's own tokens, an h1 and a sentence.
 * They exist so a mistyped URL, a loader that 500s, or an account with no
 * console screen gets the product rather than the browser's default.
 */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-8 text-fg">
      <div className="max-w-md rounded-card border border-line bg-panel p-6">
        <h1 className="m-0 text-[17px] font-semibold">{title}</h1>
        <p className="m-0 mt-2 text-[13px] leading-[1.55] text-muted">{children}</p>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <Panel title="Page not found">
      That address does not exist.{" "}
      <a href="/console" className="text-accent">
        Go to the console
      </a>
      .
    </Panel>
  );
}

export function RouteError({ error }: ErrorComponentProps) {
  return (
    <Panel title="Something went wrong">
      {error instanceof Error && error.message ? error.message : "This page could not be loaded."}
    </Panel>
  );
}

/**
 * A signed-in account with no console screen at all — a Viewer holds only
 * `territory:read` and its siblings. Deliberately not a redirect: there is
 * nowhere to send them, and bouncing around the subtree looking for a page
 * that will have them is how a loop starts.
 */
export function NoConsoleAccess() {
  return (
    <Panel title="No console access">
      Your account has no console permissions. Ask your organisation owner for the access you need.
    </Panel>
  );
}
