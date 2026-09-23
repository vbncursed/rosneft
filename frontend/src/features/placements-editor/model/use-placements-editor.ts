import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  createPlacement,
  deletePlacement,
  idle,
  creating,
  mutating,
  realWorldScale,
  setPlacementVisibility,
  updatePlacement,
  type MutationState,
  type Placement,
  type PlacementTransform,
  type PlacementUpdate,
  type ResolvedPlacement,
} from "@/entities/placement";
import type { ModelOption } from "@/entities/scene";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";

export type PlacementsEditorParams = {
  slug: string;
  initial: ResolvedPlacement[];
  options: ModelOption[];
  /** The longest side of the territory's source bbox, in real-world units; 0 when unknown. */
  territoryMaxDim: number;
  /** Panoramas a newly created object is visible in (spec §6.1: everywhere loaded). */
  panoramaIds: number[];
  /** Every successful mutation calls this; the page marks the scene bundle stale. */
  onChanged: () => void;
};

/** How far a batch of N has got. Null when nothing is being placed. */
export type Placing = { done: number; total: number };

/**
 * The placement editor's state: the list, the in-flight mutation and the
 * batch-create progress. Mutations are optimistic — each swaps the
 * server-acknowledged placement into local state — and every success tells the
 * page, which marks the bundle stale so the next visit re-reads it.
 */
export function usePlacementsEditor({
  slug,
  initial,
  options,
  territoryMaxDim,
  panoramaIds,
  onChanged,
}: PlacementsEditorParams) {
  const [placements, setPlacements] = useState<ResolvedPlacement[]>(initial);
  const [mutation, setMutation] = useState<MutationState>(idle);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [, startTransition] = useTransition();

  const resolve = useCallback(
    (p: Placement): ResolvedPlacement => ({
      ...p,
      // The chain comes from the bundle's model options, so no per-placement
      // artifact round-trip is needed after a create.
      chain: options.find((option) => option.slug === p.modelSlug)?.chain ?? [],
    }),
    [options],
  );

  const create = useCallback(
    async (modelSlug: string, count: number): Promise<number | null> => {
      const total = Math.max(1, Math.floor(count));
      const created: ResolvedPlacement[] = [];
      setMutation(creating);
      setPlacing({ done: 0, total });
      try {
        // Both GLBs are normalised to max-axis 2, so scale 1 would draw the
        // model as large as the whole territory. Lay the copies in a row along
        // X — each occupies ~2*scale scene units, and a tenth of that is the gap
        // — so N of them do not stack invisibly on one spot.
        const scale = realWorldScale(
          options.find((option) => option.slug === modelSlug),
          territoryMaxDim,
        );
        const step = 2 * scale * 1.1;
        for (let i = 0; i < total; i++) {
          // ponytail: N sequential POSTs; add a batch endpoint if N grows large.
          const placement = await createPlacement(slug, {
            modelSlug,
            position: { x: i * step, y: 0, z: 0 },
            scale: { x: scale, y: scale, z: scale },
            visiblePanoramaIds: panoramaIds,
          });
          created.push(resolve(placement));
          setPlacing({ done: i + 1, total });
        }
        return created[created.length - 1].id;
      } catch (err) {
        // A refusal part-way through a batch leaves the POSTs before it
        // standing on the server. The rows that landed are shown, and the
        // next visit's fresh bundle reconciles the rest; the answer is still
        // null, because there is no last id to select.
        notify.error(messageOf(err));
        return null;
      } finally {
        // Both paths: whatever the loop got through exists, so it belongs on
        // screen, and onChanged marks the bundle stale for the next visit.
        if (created.length > 0) {
          startTransition(() => setPlacements((prev) => [...prev, ...created]));
          onChanged();
        }
        setPlacing(null);
        setMutation(idle);
      }
    },
    [slug, options, territoryMaxDim, panoramaIds, resolve, onChanged],
  );

  const update = useCallback(
    async (id: number, body: PlacementUpdate) => {
      setMutation(mutating(id));
      try {
        const next = resolve(await updatePlacement(slug, id, body));
        startTransition(() => setPlacements((prev) => prev.map((p) => (p.id === id ? next : p))));
        onChanged();
      } catch (err) {
        notify.error(messageOf(err));
      } finally {
        setMutation(idle);
      }
    },
    [slug, resolve, onChanged],
  );

  const setVisibility = useCallback(
    async (id: number, ids: number[]) => {
      setMutation(mutating(id));
      try {
        const next = resolve(await setPlacementVisibility(slug, id, ids));
        startTransition(() => setPlacements((prev) => prev.map((p) => (p.id === id ? next : p))));
        onChanged();
      } catch (err) {
        notify.error(messageOf(err));
      } finally {
        setMutation(idle);
      }
    },
    [slug, resolve, onChanged],
  );

  const remove = useCallback(
    async (id: number) => {
      setMutation(mutating(id));
      try {
        await deletePlacement(slug, id);
        startTransition(() => setPlacements((prev) => prev.filter((p) => p.id !== id)));
      } catch (err) {
        notify.error(messageOf(err));
      } finally {
        // Both ways: a refused delete may mean the row is already gone for
        // another reason, and only the gateway can say. The page marks the
        // bundle stale and the next visit seeds from a fresh one — this hook
        // does not adopt a changed `initial` on its own.
        onChanged();
        setMutation(idle);
      }
    },
    [slug, onChanged],
  );

  // A ref, so commitTransform stays reference-stable: the gizmo's
  // dragging-changed listener is re-attached whenever its dep chain moves, and
  // that chain leads back to here.
  const placementsRef = useRef(placements);
  useEffect(() => {
    placementsRef.current = placements;
  }, [placements]);

  const commitTransform = useCallback(
    async (id: number, transform: PlacementTransform) => {
      // The PUT carries the whole placement, so a transform-only drag has to
      // send the label back or the server would blank it.
      const label = placementsRef.current.find((p) => p.id === id)?.label ?? "";
      await update(id, { ...transform, label });
    },
    [update],
  );

  const rename = useCallback(
    async (id: number, label: string) => {
      const p = placementsRef.current.find((x) => x.id === id);
      if (!p) return;
      await update(id, { position: p.position, rotation: p.rotation, scale: p.scale, label });
    },
    [update],
  );

  return {
    placements,
    mutation,
    pendingIds: mutation.kind === "mutating" ? [mutation.id] : [],
    placing,
    create,
    update,
    rename,
    remove,
    commitTransform,
    setVisibility,
  };
}
