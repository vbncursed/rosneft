import { createRoute, redirect } from "@tanstack/react-router";
import { meQuery } from "@/entities/user";
import { AccountScreen } from "@/pages/account";
import { ModelDetailScreen } from "@/pages/model-detail";
import { ModelLibraryScreen } from "@/pages/model-library";
import { ReplaceSourceScreen } from "@/pages/replace-source";
import { TerritoryCatalogScreen } from "@/pages/territory-catalog";
import { TwoFactorScreen } from "@/pages/two-factor";
import { UploadModelsScreen } from "@/pages/upload-models";
import { UploadTerritoryScreen } from "@/pages/upload-territory";
import { isAuthed } from "@/shared/session";
import { CatalogShellRoute } from "./catalog-shell-route";
import { redirectTarget } from "./guard";
import { rootRoute } from "./routes";

// The catalog shell has no sidebar-derived gate: any signed-in principal
// reaches all six routes, and the upload/card/page actions are what the
// write and delete grants narrow instead. Gated the same way as /console —
// redirectTarget, applied once here rather than per leaf.
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

export const territoryReplaceRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "/territories/$slug/replace",
  component: ReplaceSourceScreen,
});

export const accountRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "/account",
  component: AccountScreen,
});

// The flow is in the URL; the stage is not. The gateway issues the recovery
// codes exactly once, in the body of the call that created them, so a link
// promising them could not keep the promise after a reload — a reload lands
// back on the confirm step, honestly.
export const twoFactorRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "/account/two-factor",
  // Anything but "regenerate" is the enable flow — a hand-typed mode must land
  // somewhere real rather than throwing on the way in.
  validateSearch: (search: Record<string, unknown>): { mode: "setup" | "regenerate" } => ({
    mode: search.mode === "regenerate" ? "regenerate" : "setup",
  }),
  component: TwoFactorScreen,
});
