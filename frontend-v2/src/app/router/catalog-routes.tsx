import { createRoute, redirect } from "@tanstack/react-router";
import { meQuery } from "@/entities/user";
import { ModelDetailScreen } from "@/pages/model-detail";
import { ModelLibraryScreen } from "@/pages/model-library";
import { TerritoryCatalogScreen } from "@/pages/territory-catalog";
import { UploadModelsScreen } from "@/pages/upload-models";
import { UploadTerritoryScreen } from "@/pages/upload-territory";
import { isAuthed } from "@/shared/session";
import { CatalogShellRoute } from "./catalog-shell-route";
import { redirectTarget } from "./guard";
import { rootRoute } from "./routes";

// The catalog shell has no sidebar-derived gate: any signed-in principal
// reaches all four routes, and the upload/card actions are what the write
// and delete grants narrow instead (Tasks 4-7). Gated the same way as
// /console — redirectTarget, applied once here rather than per leaf.
export const catalogRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "catalog",
  beforeLoad: ({ location }) => {
    const target = redirectTarget(isAuthed(), location.href);
    if (target) throw redirect(target);
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery),
  component: CatalogShellRoute,
});

export const territoriesRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "/territories",
  component: TerritoryCatalogScreen,
});

export const territoryNewRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "/territories/new",
  component: UploadTerritoryScreen,
});

export const modelsRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "/models",
  component: ModelLibraryScreen,
});

export const modelNewRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "/models/new",
  component: UploadModelsScreen,
});

export const modelDetailRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "/models/$slug",
  component: ModelDetailScreen,
});
