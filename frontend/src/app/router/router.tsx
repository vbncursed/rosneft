import type { QueryClient } from "@tanstack/react-query";
import { createRouter, type RouterHistory } from "@tanstack/react-router";
import { queryClient } from "@/app/query/query-client";
import {
  accountRoute,
  catalogRoute,
  homeRoute,
  modelDetailRoute,
  modelNewRoute,
  modelsRoute,
  territoriesRoute,
  territoryNewRoute,
  territoryReplaceRoute,
  territoryRoute,
  twoFactorRoute,
} from "./catalog-routes";
import { NotFound, RouteError } from "./fallbacks";
import {
  consoleAccessRoute,
  consoleAuditRoute,
  consoleContentRoute,
  consoleIndexRoute,
  consoleMetricsRoute,
  consoleRolesRoute,
  consoleRoute,
  consoleUsersRoute,
  loginRoute,
  rootRoute,
} from "./routes";

const routeTree = rootRoute.addChildren([
  loginRoute,
  consoleRoute.addChildren([
    consoleIndexRoute,
    consoleUsersRoute,
    consoleRolesRoute,
    consoleContentRoute,
    consoleAccessRoute,
    consoleAuditRoute,
    consoleMetricsRoute,
  ]),
  catalogRoute.addChildren([
    homeRoute,
    territoriesRoute,
    territoryNewRoute,
    territoryRoute,
    modelsRoute,
    modelNewRoute,
    modelDetailRoute,
    territoryReplaceRoute,
    accountRoute,
    twoFactorRoute,
  ]),
]);

// A factory so the spec can drive the real tree through a memory history.
export function createAppRouter(history?: RouterHistory, client: QueryClient = queryClient) {
  return createRouter({
    routeTree,
    history,
    context: { queryClient: client },
    // "root": the 404 draws its own chrome, so it must never land in a shell's <main>.
    notFoundMode: "root",
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: RouteError,
  });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
