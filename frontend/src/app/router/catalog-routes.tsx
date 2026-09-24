import { createRoute, redirect } from "@tanstack/react-router";
import { sceneQuery } from "@/entities/scene";
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
import { enrollmentRedirect, redirectTarget } from "./guard";
import { HomeRoute } from "./home-route";
import { rootRoute } from "./routes";
import { TerritoryRoute } from "./territory-route";

// The catalog shell has no sidebar-derived gate: any signed-in principal
// reaches all six routes, and the upload/card/page actions are what the
// write and delete grants narrow instead. Gated the same way as /console —
// redirectTarget, applied once here rather than per leaf.
export const catalogRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "catalog",
  beforeLoad: async ({ context, location }) => {
    const target = redirectTarget(isAuthed(), location.href);
    if (target) throw redirect(target);
    // beforeLoad, not loader: children's loaders run beside the parent's, and
    // the console index's landing redirect would race this one.
    const to = enrollmentRedirect(await context.queryClient.ensureQueryData(meQuery), location.pathname);
    if (to) throw redirect({ to });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(meQuery),
  component: CatalogShellRoute,
});

// Home replaced the redirect to /console on 2026-09-08: the app is no longer
// "the console", and a Viewer with no console screen has a page of its own.
export const homeRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "/",
  component: HomeRoute,
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

// One URL for both faces of a territory: the viewer once a LOD0 is converted
// and nobody is watching a job, the conversion page otherwise. The loader
// warms the bundle the branch reads, so the first paint is already the right
// screen rather than the conversion page flashing in front of a ready viewer.
//
// It swallows every failure and never throws. A 404 and a 503 both have a
// designed screen already — the territory 404 view, "No territory at this
// address", with the way back, and
// "Territory unavailable: {message}" — and both live behind the conversion
// screen, which is where `!data` falls through to. Throwing here would replace
// those with the router's global panels.
//
// The upload and replace flows arrive with the job they just created, so the
// page can open its SSE channel at once; without one it reads the poll.
export const territoryRoute = createRoute({
  getParentRoute: () => catalogRoute,
  path: "/territories/$slug",
  // The search parser may hand back an all-digit id as a number, which this
  // guard then drops; a 32-char hex id is all digits with probability ~3e-7,
  // and the cost is the poll instead of the stream.
  validateSearch: (search: Record<string, unknown>): { jobId?: string } =>
    typeof search.jobId === "string" && search.jobId !== "" ? { jobId: search.jobId } : {},
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(sceneQuery(params.slug)).catch(() => undefined),
  component: TerritoryRoute,
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
