import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { computeUnitRatio } from "@/entities/measurement";
import { measureSummary, useMeasurementTool } from "@/features/measure";
import { pickLod, getSceneBundle, sceneQuery, toSceneViewModel } from "@/entities/scene";
import { getMe, meQuery } from "@/entities/user";
import { viewerError } from "@/features/lod";
import { useTour, VIEWER_TOUR, VIEWER_TOUR_STEPS } from "@/features/onboarding";
import { usePlacementsEditor } from "@/features/placements-editor";
import { useViewerMode } from "@/features/viewer-mode";
import { HttpError, messageOf } from "@/shared/api";
import { useMediaQuery } from "@/shared/lib/use-media-query";
import { unanswered } from "@/shared/lib/unanswered";
import { can } from "@/shared/session";
import { useOverlaysPanel } from "@/widgets/overlays-panel";
import type { LodReport } from "@/widgets/viewer-canvas";
import { pageProps, type TerritoryViewerPageProps } from "./page-props";
import { usePlacementForm } from "./use-placement-form";

export type TerritoryViewerState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "unavailable"; error: string }
  | ({ status: "ready" } & TerritoryViewerPageProps);

const NO_REPORT: LodReport = {
  shown: null,
  target: null,
  percent: null,
  progressText: null,
  failure: null,
};

/**
 * The canvas's last report, with the moment its failure arrived.
 *
 * The error card's footer answers "when did this last try", so the clock is
 * stamped when the failure lands rather than read while the card is being
 * drawn — otherwise every re-render behind it (a reset, a panel fold, a
 * refetch) moved "last attempt" forward to now.
 */
type LodState = { report: LodReport; failedAt: Date | null };

const NO_LOD: LodState = { report: NO_REPORT, failedAt: null };

/** Never read — `error` is non-null only when `failedAt` is. */
const UNSTAMPED = new Date(0);

/** Under this the panel is 300 wide and the gizmo keys lose their brackets. */
const COMPACT = "(max-width: 1280px)";

/**
 * Everything the viewer page draws: the bundle, the principal's grants, and
 * the six hooks that own the scene's interaction — mode, measurement,
 * placements, the form, the panel and the tour.
 *
 * **The mode is `useViewerMode`'s, not the measure tool's.** The tool keeps a
 * `measureMode` flag of its own from when it was the only owner of that state;
 * it is deliberately ignored here, and `toggle`/`exit` are never called. One
 * source of truth, and the reducer that also owns the selection and the gizmo
 * is the one that has to win. An unfinished chain is broken by Escape, which
 * `useViewerMode` already routes to `cancelChain`.
 *
 * **The editor is not re-keyed on the bundle.** `usePlacementsEditor` seeds
 * from `initial` once and is optimistic afterwards, so it and a bundle
 * refetched after one of *our own* mutations already agree. Remounting it on
 * `placements.length` — the only field a placement mutation actually moves —
 * would also throw away the create form that `onPlace` opens one tick later,
 * which is the flow the picker exists for. A refetch carrying *another*
 * reader's edits is therefore not adopted until the page is reloaded; noted
 * rather than solved, because the fix belongs in the editor hook.
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
    }),
    [me.data],
  );

  const [targetLod, setTargetLod] = useState(0);
  const [retryVersion, setRetryVersion] = useState(0);
  const [resetVersion, setResetVersion] = useState(0);
  const [focusRequest, setFocusRequest] = useState<number[] | null>(null);
  const [lod, setLod] = useState<LodState>(NO_LOD);
  const report = lod.report;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const compact = useMediaQuery(COMPACT);

  const measure = useMeasurementTool();
  const mode = useViewerMode({
    canWrite: grants.write,
    // Task 15 wires the real values once panoramas land on this page.
    canMovePoints: false,
    chainOpen: measure.activeChainId !== null,
    onCancelChain: measure.cancelChain,
    onCycle: () => {},
  });

  const dims = vm?.metadata.dims ?? { x: 0, y: 0, z: 0 };
  const onChanged = useCallback(() => {
    void client.invalidateQueries({ queryKey: ["scene", slug] });
  }, [client, slug]);
  const editor = usePlacementsEditor({
    slug,
    initial: vm?.placements ?? [],
    options: bundle?.modelOptions ?? [],
    territoryMaxDim: Math.max(dims.x, dims.y, dims.z),
    // Task 15 wires the real panorama ids once panoramas land on this page.
    panoramaIds: [],
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

  // Canvas-bound callbacks are memoized: each is a prop on a tree that mounts
  // WebGL, and a fresh identity re-runs the effects that attach to the scene.
  const onLod = useCallback(
    (next: LodReport) =>
      setLod((prev) => ({
        report: next,
        // A second failure of the same level is the same attempt still being
        // reported; a different hash is a new one and gets a new stamp.
        failedAt: next.failure
          ? prev.report.failure?.hash === next.failure.hash
            ? prev.failedAt
            : new Date()
          : null,
      })),
    [],
  );
  const onReset = useCallback(() => setResetVersion((v) => v + 1), []);
  const onRetry = useCallback(() => setRetryVersion((v) => v + 1), []);
  const onFocus = useCallback((id: number) => setFocusRequest([id]), []);
  const onToggleGroup = useCallback(
    (modelSlug: string) => setExpandedModel((open) => (open === modelSlug ? null : modelSlug)),
    [],
  );
  const openPicker = useCallback(() => {
    mode.enterPlace();
    setPickerOpen(true);
  }, [mode]);
  const closePicker = useCallback(() => {
    mode.exitPlace();
    setPickerOpen(false);
  }, [mode]);
  const onPlace = useCallback(
    async (modelSlug: string, count: number) => {
      const id = await editor.create(modelSlug, count);
      closePicker();
      // The POSTs already landed, so the new object is in the scene; the form
      // opens on the last of them to be named, and cancelling it deletes it.
      if (id !== null) form.openNew(id);
    },
    [editor, form, closePicker],
  );

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
      panel: { tab: panel.tab, collapsed: panel.collapsed },
      view: {
        report,
        targetLod,
        retryVersion,
        resetVersion,
        focusRequest,
        pickerOpen,
        query,
        expandedModel,
        compact,
        error: viewerError(report.failure, vm.parentLods, pickLod(vm.parentLods, targetLod), slug),
        now: lod.failedAt ?? UNSTAMPED,
      },
      on: {
        onPick: mode.select,
        onTransformCommit: editor.commitTransform,
        onMeasurePoint: measure.click,
        onCloseActiveChain: measure.closeActive,
        onRemoveSegment: measure.removeSegment,
        onRemoveChain: measure.removeChain,
        onLod,
        onReset,
        onMeasure: mode.toggleMeasure,
        onAdd: openPicker,
        onReplayTour: tour.restart,
        onTargetLod: setTargetLod,
        onRetry,
        onClearMeasurements: measure.clear,
        onTab: panel.setTab,
        onCollapsed: panel.setCollapsed,
        onQuery: setQuery,
        onToggleGroup,
        onSelect: mode.select,
        onRename: form.openRename,
        onDelete: editor.remove,
        onFocus,
        onGizmo: mode.setGizmo,
        onSnap: mode.toggleSnap,
        onPlace,
        onClosePicker: closePicker,
      },
    }),
  };
}
