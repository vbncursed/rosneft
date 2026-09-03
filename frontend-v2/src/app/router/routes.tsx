import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { meQuery } from "@/entities/user";
import { isAuthed } from "@/shared/session";
import { ConsoleShell } from "./console-shell";
import { LoginRouteComponent } from "./login-route";
import { NoConsoleAccess } from "./fallbacks";
import { consoleLanding, redirectTarget, screenAllowed, type ConsolePath } from "./guard";

// One loader for every screen: the console gate is an OR over several grants,
// so a screen must ask for its own. /console's landing never picks a screen
// that fails this, so the bounce cannot loop.
const gate =
  (path: ConsolePath) =>
  async ({ context }: { context: { queryClient: QueryClient } }) => {
    if (!screenAllowed(await context.queryClient.ensureQueryData(meQuery), path)) {
      throw redirect({ to: "/console" });
    }
  };

// The router carries the query client so a route can load data before it
// renders. `consoleIndexRoute` needs the principal to decide where to send the
// caller, and reaching for the module-level client instead would make the
// route untestable against any other one.
export const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Outlet,
});

// Nothing lives at the root: the app is the console. Not an auth check of its
// own — /console has one, and duplicating it here would be a second thing to
// keep in step.
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/console" });
  },
});

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginRouteComponent,
});

// `/console` draws nothing itself — its index child resolves a landing screen
// and the rest are the screens. Gates the whole subtree with the one decision
// that matters — redirectTarget — so no child route repeats the check.
export const consoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/console",
  beforeLoad: ({ location }) => {
    const target = redirectTarget(isAuthed(), location.href);
    if (target) throw redirect(target);
  },
  // Entering the console fetches the principal. It feeds the landing redirect
  // below, and it is what makes the guard real rather than apparent: the
  // marker is a flag, not proof, so a revoked session gets past `beforeLoad`
  // and is only caught when something actually calls the gateway.
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery),
  component: ConsoleShell,
});

// `/console` alone. A landing screen is a permission decision, not a constant
// — see `consoleLanding`, which owns it and has its own spec.
export const consoleIndexRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/",
  loader: async ({ context }) => {
    const target = consoleLanding(await context.queryClient.ensureQueryData(meQuery));
    if (target) throw redirect({ to: target });
  },
  component: NoConsoleAccess,
});

export const consoleUsersRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/users",
  loader: gate("/console/users"),
  component: () => <p>Users</p>,
});

export const consoleRolesRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/roles",
  loader: gate("/console/roles"),
  component: () => <p>Roles & Permissions</p>,
});

export const consoleContentRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/content",
  loader: gate("/console/content"),
  component: () => <p>Content</p>,
});

export const consoleAccessRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/access",
  loader: gate("/console/access"),
  component: () => <p>Territory access</p>,
});

export const consoleAuditRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/audit",
  loader: gate("/console/audit"),
  component: () => <p>Audit journal</p>,
});

export const consoleMetricsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/metrics",
  loader: gate("/console/metrics"),
  component: () => <p>Metrics</p>,
});
