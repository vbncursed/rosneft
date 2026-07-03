import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  createPlacement,
  deletePlacement,
  listPlacements,
  setPlacementVisibility,
  updatePlacement,
} from "@/placement/infrastructure/placement-gateway";
import type { GizmoMode } from "@/placement/domain/gizmo-mode";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import type {
  Placement,
  PlacementTransform,
  PlacementUpdate,
  ResolvedPlacement,
} from "@/placement/domain/placement";
import {
  creating,
  idle,
  mutating,
  type MutationState,
} from "@/placement/domain/mutation-state";
import { formatError } from "@/shared/infrastructure/http/format-error";
import { notify } from "@/shared/presentation/toast/use-toast";

const DEFAULT_SCALE = 0.1;

function realWorldRatio(
  options: PlacementAssetOption[],
  modelSlug: string,
  territoryMaxDim: number,
): number {
  if (territoryMaxDim <= 0) return DEFAULT_SCALE;
  const m = options.find((o) => o.slug === modelSlug);
  if (!m?.bboxMin || !m?.bboxMax) return DEFAULT_SCALE;
  const dx = m.bboxMax.x - m.bboxMin.x;
  const dy = m.bboxMax.y - m.bboxMin.y;
  const dz = m.bboxMax.z - m.bboxMin.z;
  const modelMax = Math.max(dx, dy, dz);
  if (modelMax <= 0) return DEFAULT_SCALE;
  return modelMax / territoryMaxDim;
}

// usePlacementsEditor owns every piece of placement-editor state: the
// list, the gizmo selection + mode, the in-flight mutation, and the
// last error. Mutations stay optimistic — the CRUD handlers swap the
// pre-resolve placement out for the server-acknowledged version inside
// startTransition so React keeps the UI responsive during the round-trip.
//
// LOD chains are derived from modelOptions (loaded once with the page
// bundle) via a slug → lods map, so CRUD doesn't need a per-placement
// getArtifact round-trip.
// territoryMaxDim is the longest side of the territory's source-mesh
// bbox in real-world units. Used to size freshly-placed models in 1:1
// proportions against the territory. Pass 0 when unknown — the editor
// falls back to a small default scale.
export function usePlacementsEditor(
  territorySlug: string,
  initial: ResolvedPlacement[],
  modelOptions: PlacementAssetOption[],
  territoryMaxDim: number,
) {
  const [placements, setPlacements] = useState<ResolvedPlacement[]>(initial);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<GizmoMode>("translate");
  const [mutation, setMutation] = useState<MutationState>(idle);
  const [, startTransition] = useTransition();

  const resolve = useCallback(
    (p: Placement): ResolvedPlacement => ({
      ...p,
      lods:
        modelOptions.find((option) => option.slug === p.modelSlug)?.lods ?? [],
    }),
    [modelOptions],
  );

  const refresh = useCallback(async () => {
    const fresh = await listPlacements(territorySlug);
    setPlacements(fresh.map(resolve));
  }, [territorySlug, resolve]);

  const create = useCallback(
    async (modelSlug: string, visiblePanoramaIds?: number[], count = 1) => {
      setMutation(creating);
      try {
        // Both territory and model GLBs are normalised to max-axis=2,
        // so scale 1 would render the model as large as the whole
        // territory. Use the source-mesh bbox ratio to land the
        // placement at real-world proportions: scale = modelMax /
        // territoryMax. Fall back to 0.1 when either side lacks bbox
        // metadata (older artifacts, conversion still pending, etc.).
        const ratio = realWorldRatio(modelOptions, modelSlug, territoryMaxDim);
        // Lay N copies in a row along X so they don't stack invisibly on top
        // of one another. Each occupies ~2*ratio scene units (GLB max-axis=2
        // scaled by ratio); 1.1 leaves a small gap. count=1 lands at origin,
        // identical to the previous single-placement behaviour.
        const step = 2 * ratio * 1.1;
        const n = Math.max(1, Math.floor(count));
        const created: ResolvedPlacement[] = [];
        for (let i = 0; i < n; i++) {
          // ponytail: N sequential POSTs; add a batch endpoint if N grows large.
          const placement = await createPlacement(territorySlug, {
            modelSlug,
            position: { x: i * step, y: 0, z: 0 },
            scale: { x: ratio, y: ratio, z: ratio },
            visiblePanoramaIds,
          });
          created.push(resolve(placement));
        }
        startTransition(() => setPlacements((prev) => [...prev, ...created]));
      } catch (err) {
        notify.error(formatError(err));
      } finally {
        setMutation(idle);
      }
    },
    [territorySlug, resolve, modelOptions, territoryMaxDim],
  );

  // Run a mutation that returns the server-acknowledged placement and swap
  // it into local state optimistically. Shared by the transform, visibility
  // and per-panorama-name edits — each returns the full placement, so the
  // others' fields are preserved on every round-trip.
  const replaceById = useCallback(
    async (id: number, run: () => Promise<Placement>) => {
      setMutation(mutating(id));
      try {
        const resolved = resolve(await run());
        startTransition(() =>
          setPlacements((prev) =>
            prev.map((p) => (p.id === id ? resolved : p)),
          ),
        );
      } catch (err) {
        notify.error(formatError(err));
      } finally {
        setMutation(idle);
      }
    },
    [resolve],
  );

  const update = useCallback(
    (id: number, body: PlacementUpdate) =>
      replaceById(id, () => updatePlacement(territorySlug, id, body)),
    [territorySlug, replaceById],
  );

  // Visibility and names are independent of the transform — these never touch
  // position/rotation/scale.
  const setVisibility = useCallback(
    (id: number, panoramaIds: number[]) =>
      replaceById(id, () =>
        setPlacementVisibility(territorySlug, id, panoramaIds),
      ),
    [territorySlug, replaceById],
  );


  const remove = useCallback(
    async (id: number) => {
      setMutation(mutating(id));
      try {
        await deletePlacement(territorySlug, id);
        startTransition(() => {
          setPlacements((prev) => prev.filter((p) => p.id !== id));
          setSelectedId((current) => (current === id ? null : current));
        });
      } catch (err) {
        notify.error(formatError(err));
        await refresh().catch(() => undefined);
      } finally {
        setMutation(idle);
      }
    },
    [territorySlug, refresh],
  );

  // Keep a ref to the current placements so commitTransform stays
  // reference-stable. Without this the gizmo's dragging-changed listener
  // in PlacementsLayer is re-attached on every CRUD round-trip because
  // its useEffect dep chain leads back to onCommit.
  const placementsRef = useRef(placements);
  useEffect(() => {
    placementsRef.current = placements;
  }, [placements]);

  const commitTransform = useCallback(
    async (id: number, t: PlacementTransform) => {
      // Label is preserved server-side; we look it up from current state
      // to avoid wiping it on a transform-only drag.
      const label = placementsRef.current.find((p) => p.id === id)?.label ?? "";
      await update(id, { ...t, label });
    },
    [update],
  );

  // Rename keeps a placement's transform and swaps only the territory-level
  // label — the object's single name, shown everywhere.
  const rename = useCallback(
    async (id: number, label: string) => {
      const p = placementsRef.current.find((x) => x.id === id);
      if (!p) return;
      await update(id, {
        position: p.position,
        rotation: p.rotation,
        scale: p.scale,
        label,
      });
    },
    [update],
  );

  return {
    placements,
    selectedId,
    mode,
    mutation,
    setSelectedId,
    setMode,
    create,
    update,
    setVisibility,
    rename,
    remove,
    commitTransform,
  };
}
