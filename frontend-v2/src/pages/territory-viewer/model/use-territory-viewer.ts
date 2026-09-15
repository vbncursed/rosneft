import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { computeUnitRatio } from "@/entities/measurement";
import { pickLod, getSceneBundle, sceneQuery, toSceneViewModel } from "@/entities/scene";
import { getMe, meQuery } from "@/entities/user";
import { viewerError } from "@/features/lod";
import { measureSummary, useMeasurementTool } from "@/features/measure";
import { useTour, VIEWER_TOUR, VIEWER_TOUR_STEPS } from "@/features/onboarding";
import { usePlacementsEditor } from "@/features/placements-editor";
import { useViewerMode } from "@/features/viewer-mode";
import { HttpError, messageOf } from "@/shared/api";
import { useMediaQuery } from "@/shared/lib/use-media-query";
import { unanswered } from "@/shared/lib/unanswered";
import { can } from "@/shared/session";
import { useOverlaysPanel } from "@/widgets/overlays-panel";
import { decodeImageBitmap } from "@/widgets/viewer-canvas";
import { pageProps, type TerritoryViewerPageProps } from "./page-props";
import { usePageHandlers } from "./use-page-handlers";
import { usePlacementForm } from "./use-placement-form";
import { useViewerDocuments } from "./use-viewer-documents";
import { useViewerPanoramas } from "./use-viewer-panoramas";

export type TerritoryViewerState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "unavailable"; error: string }
  | ({ status: "ready" } & TerritoryViewerPageProps);

/** Never read — `error` is non-null only when `failedAt` is. */
const UNSTAMPED = new Date(0);

/** Under this the panel is 300 wide and the gizmo keys lose their brackets. */
const COMPACT = "(max-width: 1280px)";

/**
 * Everything the viewer page draws: the bundle, the principal's grants, and
 * the hooks that own the scene's interaction — mode, measurement, placements,
 * the form, the panel, the tour, and package B's two overlay slices.
 *
 * **The mode is `useViewerMode`'s, not the measure tool's.** The tool keeps a
 * `measureMode` flag of its own from when it was the only owner of that state;
 * it is deliberately ignored here, and `toggle`/`exit` are never called. One
 * source of truth, and the reducer that also owns the selection, the gizmo,
 * the panorama the camera is in and the move sub-mode is the one that has to
 * win. An unfinished chain is broken by Escape, which `useViewerMode` already
 * routes to `cancelChain`.
 *
 * **Two of the reducer's keys are answered by hooks created after it**, so
 * both travel through a ref: P cycles the panorama list, and Escape is offered
 * to an open document first. Wiring them directly would need the panorama and
 * document hooks above the reducer that feeds them, which is a cycle.
 *
 * **Neither the editor nor the two overlay lists is re-keyed on the bundle.**
 * All three seed from `initial` once and are optimistic afterwards, so they and
 * a bundle refetched after one of *our own* mutations already agree; the screen
 * keys the whole body on whether the bundle is in hand
 * (`use-scene-seeded.ts`), which is what makes that one seed the real list
 * rather than an empty one. Remounting on the lists themselves would also
 * throw away the create form that `onPlace` opens one tick later, which is the
 * flow the picker exists for. A refetch carrying *another* reader's edits is
 * therefore not adopted until the page is reloaded; noted rather than solved,
 * because the fix belongs in the list hooks.
 */
export function useTerritoryViewer(slug: string): TerritoryViewerState {
  const client = useQueryClient();
  // The queryFns stay direct imports so a spec's vi.mock of the barrel reaches them.
  const me = useQuery({ ...meQuery, queryFn: getMe });
  const scene = useQuery({ ...sceneQuery(slug), queryFn: () => getSceneBundle(slug) });
  const bundle = scene.data;
  const vm = useMemo(() => (bundle ? toSceneViewModel(bundle) : null), [bundle]);

  const grants = useMemo(
    () => ({
      create: can(me.data ?? null, "placement:create"),
      write: can(me.data ?? null, "placement:write"),
      delete: can(me.data ?? null, "placement:delete"),
      replace: can(me.data ?? null, "territory:write"),
      panoramaCreate: can(me.data ?? null, "panorama:create"),
      panoramaWrite: can(me.data ?? null, "panorama:write"),
      panoramaDelete: can(me.data ?? null, "panorama:delete"),
      documentWrite: can(me.data ?? null, "document:write"),
      documentDelete: can(me.data ?? null, "document:delete"),
    }),
    [me.data],
  );

  const compact = useMediaQuery(COMPACT);
  const measure = useMeasurementTool();

  const cycle = useRef<() => void>(() => {});
  const beforeEscape = useRef<() => boolean>(() => false);
  const mode = useViewerMode({
    canWrite: grants.write,
    canMovePoints: grants.panoramaWrite,
    chainOpen: measure.activeChainId !== null,
    onCancelChain: measure.cancelChain,
    onCycle: useCallback(() => cycle.current(), []),
    beforeEscape: useCallback(() => beforeEscape.current(), []),
  });

  const onChanged = useCallback(() => {
    void client.invalidateQueries({ queryKey: ["scene", slug] });
  }, [client, slug]);

  const panoramas = useViewerPanoramas({
    slug,
    initial: vm?.panoramas ?? [],
    mode: {
      view: mode.state.view,
      editingPanoramaId: mode.state.editingPanoramaId,
      enterPanorama: mode.enterPanorama,
      exitPanorama: mode.exitPanorama,
      startEdit: mode.startEdit,
      closeEdit: mode.closeEdit,
    },
    moving: mode.state.move,
    sourceBbox: vm?.sourceBbox ?? null,
    externalUrl: bundle?.territory.externalPanoramaUrl,
    onChanged,
    decode: decodeImageBitmap,
  });
  const documents = useViewerDocuments({
    slug,
    initial: vm?.documents ?? [],
    onChanged,
    // The two overlays do not stack: a PDF takes the viewport the sphere had.
    onOpen: mode.exitPanorama,
  });
  useEffect(() => {
    cycle.current = panoramas.onCycle;
    beforeEscape.current = documents.escape;
  });

  const dims = vm?.metadata.dims ?? { x: 0, y: 0, z: 0 };
  const editor = usePlacementsEditor({
    slug,
    initial: vm?.placements ?? [],
    options: bundle?.modelOptions ?? [],
    territoryMaxDim: Math.max(dims.x, dims.y, dims.z),
    // Spec §6.1: a new object is visible everywhere the territory is loaded.
    panoramaIds: panoramas.list.map((p) => p.id),
    onChanged,
  });
  // The selection is what opens the form, and a reader without `placement:write`
  // is handed none: that is the one state where the block only reports.
  const form = usePlacementForm(editor, mode.select, grants.write ? mode.state.selectedId : null);

  const seen = me.data?.onboardingToursSeen.includes(VIEWER_TOUR) ?? true;
  // Ready waits for the principal as well as the scene. `useTour` reads `seen`
  // only on the edge where `ready` flips, so a scene that arrived before the
  // principal would be judged against the "assume seen" default and the tour
  // would never run for a first-time reader.
  const tour = useTour(VIEWER_TOUR, VIEWER_TOUR_STEPS, {
    seen,
    ready: vm !== null && me.data !== undefined,
  });
  // The tour reveals a control before it points at one: its step names the tab
  // its anchor lives on, and an inactive tab is not in the DOM at all.
  const panel = useOverlaysPanel(mode.state.selectedId, tour.step?.tab, tour.active);

  const { view, failedAt, on } = usePageHandlers({
    mode,
    measure,
    editor,
    form,
    panel,
    tour,
    documents,
  });

  if (me.isPending || scene.isPending) return { status: "loading" };
  // Only the *scene's* 404 means "no such territory, or not this reader's". A
  // 404 from /me is a broken session route, and answering "Territory not found"
  // there would name the wrong thing.
  const sceneErr = unanswered(scene);
  const err = sceneErr ?? unanswered(me);
  if (sceneErr instanceof HttpError && sceneErr.status === 404) return { status: "missing" };
  if (err) return { status: "unavailable", error: messageOf(err) };
  // A converted territory always maps; an unconverted one is the conversion
  // page's, and the route never sends it here.
  if (!vm) return { status: "unavailable", error: "This territory has no converted mesh." };

  return {
    status: "ready",
    ...pageProps({
      slug,
      title: bundle!.territory.title,
      grants,
      vm,
      options: bundle!.modelOptions,
      mode: mode.state,
      measure: {
        chains: measure.chains,
        activeChainId: measure.activeChainId,
        summary: measureSummary(measure.chains, computeUnitRatio(dims)),
      },
      placements: editor.placements,
      pendingIds: editor.pendingIds,
      placing: editor.placing,
      form: form.form,
      tour,
      // Task 17 writes the panorama tour; until it does the viewer's own tour
      // stands in, so nothing reads an undefined shape.
      panoramaTour: tour,
      panoramas,
      documents,
      panel: { tab: panel.tab, collapsed: panel.collapsed },
      view: {
        ...view,
        compact,
        error: viewerError(
          view.report.failure,
          vm.parentLods,
          pickLod(vm.parentLods, view.targetLod),
          slug,
        ),
        now: failedAt ?? UNSTAMPED,
      },
      on,
    }),
  };
}
