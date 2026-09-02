import { createRouter } from "@tanstack/react-router";
import {
  consoleAccessRoute,
  consoleAuditRoute,
  consoleContentRoute,
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
    consoleUsersRoute,
    consoleRolesRoute,
    consoleContentRoute,
    consoleAccessRoute,
    consoleAuditRoute,
    consoleMetricsRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
