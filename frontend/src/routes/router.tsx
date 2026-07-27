import { createRouter, Link } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { rootRoute } from "@/routes/root";
import { loginRoute } from "@/routes/login";
import { authedLayoutRoute } from "@/routes/layout";
import { homeRoute } from "@/routes/home";
import { territoryViewerRoute } from "@/routes/territory-viewer";
import { territoriesRoute } from "@/routes/territories";
import { modelsRoute } from "@/routes/models";
import { territoryNewRoute } from "@/routes/territory-new";
import { modelNewRoute } from "@/routes/model-new";
import { territoryReplaceRoute } from "@/routes/territory-replace";
import { documentNewRoute } from "@/routes/document-new";
import { panoramaNewRoute } from "@/routes/panorama-new";
import { modelDetailRoute } from "@/routes/model-detail";
import { accountRoute } from "@/routes/account";
import { adminLayoutRoute, adminIndexRoute } from "@/routes/admin";
import { adminUsersRoute } from "@/routes/admin-users";
import { adminRolesRoute } from "@/routes/admin-roles";
import { adminContentRoute } from "@/routes/admin-content";
import { adminTerritoriesRoute } from "@/routes/admin-territories";
import { queryClient } from "@/shared/infrastructure/query/query-client";

const routeTree = rootRoute.addChildren([
  loginRoute,
  authedLayoutRoute.addChildren([
    homeRoute,
    territoryViewerRoute,
    territoriesRoute,
    modelsRoute,
    territoryNewRoute,
    modelNewRoute,
    territoryReplaceRoute,
    documentNewRoute,
    panoramaNewRoute,
    modelDetailRoute,
    accountRoute,
    adminLayoutRoute.addChildren([
      adminIndexRoute,
      adminUsersRoute,
      adminRolesRoute,
      adminContentRoute,
      adminTerritoriesRoute,
    ]),
  ]),
]);

function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[radial-gradient(circle_at_top,#1c252f_0%,#0b0d10_38%,#060708_100%)] p-10 text-white">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <Link to="/" className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.2em] transition-colors hover:bg-white/[0.1]">
        ← Catalog
      </Link>
    </main>
  );
}

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultNotFoundComponent: NotFound,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  interface RouterContext {
    queryClient: QueryClient;
  }
}
