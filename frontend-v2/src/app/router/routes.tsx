import { createRootRoute, createRoute, Outlet, redirect } from "@tanstack/react-router";
import { isAuthed } from "@/shared/session";
import { redirectTarget } from "./guard";

export const rootRoute = createRootRoute({
  component: Outlet,
});

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  // Real content lands in the next task, once the login screen is wired to
  // the auth gateway.
  component: () => <p>Login</p>,
});

// Pathless-in-effect: `/console` itself has no screen, only children. Gates
// the whole subtree with the one decision that matters — redirectTarget — so
// no child route repeats the check.
export const consoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/console",
  beforeLoad: ({ location }) => {
    const target = redirectTarget(isAuthed(), location.href);
    if (target) throw redirect(target);
  },
  component: Outlet,
});

export const consoleUsersRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/users",
  component: () => <p>Users</p>,
});

export const consoleRolesRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/roles",
  component: () => <p>Roles & Permissions</p>,
});

export const consoleContentRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/content",
  component: () => <p>Content</p>,
});

export const consoleAccessRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/access",
  component: () => <p>Territory access</p>,
});

export const consoleAuditRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/audit",
  component: () => <p>Audit journal</p>,
});

export const consoleMetricsRoute = createRoute({
  getParentRoute: () => consoleRoute,
  path: "/metrics",
  component: () => <p>Metrics</p>,
});
