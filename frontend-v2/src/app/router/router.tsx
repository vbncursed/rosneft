import { createRouter } from "@tanstack/react-router";
import { queryClient } from "@/app/query/query-client";
import { NotFound, RouteError } from "./fallbacks";
import {
  catalogRoute,
  consoleAccessRoute,
  consoleAuditRoute,
  consoleContentRoute,
  consoleIndexRoute,
  consoleMetricsRoute,
  consoleRolesRoute,
  consoleRoute,
  consoleUsersRoute,
  indexRoute,
  loginRoute,
  modelNewRoute,
  modelsRoute,
  rootRoute,
  territoriesRoute,
  territoryNewRoute,
} from "./routes";

const routeTree = rootRoute.addChildren([
  indexRoute,
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
  catalogRoute.addChildren([territoriesRoute, territoryNewRoute, modelsRoute, modelNewRoute]),
]);

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultNotFoundComponent: NotFound,
  defaultErrorComponent: RouteError,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
