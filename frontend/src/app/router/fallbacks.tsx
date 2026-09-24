import type { ReactNode } from "react";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { ThemeToggle } from "@/features/theme-toggle";
import { NotFoundView } from "@/widgets/not-found";

/**
 * The three dead ends a router can reach. Their own file because the route
 * tree exports consts, and a component beside a const costs fast refresh
 * (react/only-export-components) — the same reason `login-route.tsx` is split
 * out.
 *
 * `RouteError` and `NoConsoleAccess` are deliberately plain: one panel, the
 * app's own tokens, an h1 and a sentence, so a loader that 500s or an account
 * with no console screen gets the product rather than the browser's default.
 * The 404 follows its own mock, `Not Found v2.dc.html`.
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

/**
 * `Not Found v2.dc.html`: the only fallback with a design of its own. It sits
 * outside every shell, so it draws the mock's header — the brand as the way
 * home, and the app's theme toggle (the mock's is local state; ours is not).
 */
export function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col gap-7 bg-bg px-4 pb-12 pt-8 text-fg sm:px-9">
      <header className="flex flex-wrap items-center justify-between gap-6">
        <a
          href="/"
          className="font-mono text-[10px] uppercase tracking-[0.24em] text-accent no-underline hover:underline"
        >
          Andrey Viewer
        </a>
        <ThemeToggle variant="compact" />
      </header>
      <main className="flex flex-1">
        <NotFoundView kind="page" />
      </main>
    </div>
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
      You can still{" "}
      <a href="/account" className="text-accent">
        manage your account
      </a>
      .
    </Panel>
  );
}
