import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  createPlacement,
  deletePlacement,
  listPlacements,
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    async (modelSlug: string) => {
      setMutation(creating);
      setErrorMessage(null);
      try {
        // Both territory and model GLBs are normalised to max-axis=2,
        // so scale 1 would render the model as large as the whole
        // territory. Use the source-mesh bbox ratio to land the
        // placement at real-world proportions: scale = modelMax /
        // territoryMax. Fall back to 0.1 when either side lacks bbox
        // metadata (older artifacts, conversion still pending, etc.).
        const ratio = realWorldRatio(modelOptions, modelSlug, territoryMaxDim);
        const placement = await createPlacement(territorySlug, {
          modelSlug,
          scale: { x: ratio, y: ratio, z: ratio },
        });
        const resolved = resolve(placement);
        startTransition(() => setPlacements((prev) => [...prev, resolved]));
      } catch (err) {
        setErrorMessage(formatError(err));
      } finally {
        setMutation(idle);
      }
    },
    [territorySlug, resolve, modelOptions, territoryMaxDim],
  );

  const update = useCallback(
    async (id: number, body: PlacementUpdate) => {
      setMutation(mutating(id));
      setErrorMessage(null);
      try {
        const placement = await updatePlacement(territorySlug, id, body);
        const resolved = resolve(placement);
        startTransition(() =>
          setPlacements((prev) =>
            prev.map((p) => (p.id === id ? resolved : p)),
          ),
        );
      } catch (err) {
        setErrorMessage(formatError(err));
      } finally {
        setMutation(idle);
      }
    },
    [territorySlug, resolve],
  );

  const remove = useCallback(
    async (id: number) => {
      setMutation(mutating(id));
      setErrorMessage(null);
      try {
        await deletePlacement(territorySlug, id);
        startTransition(() => {
          setPlacements((prev) => prev.filter((p) => p.id !== id));
          setSelectedId((current) => (current === id ? null : current));
        });
      } catch (err) {
        setErrorMessage(formatError(err));
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

  return {
    placements,
    selectedId,
    mode,
    mutation,
    errorMessage,
    setSelectedId,
    setMode,
    create,
    update,
    remove,
    commitTransform,
  };
}
