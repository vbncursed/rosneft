import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  createPlacements,
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
import { HttpError, messageOf } from "@/shared/api";
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

/** How big the batch in flight is. Null when nothing is being placed. */
export type Placing = { total: number };

/**
 * The placement editor's state: the list, the in-flight mutation and the batch
 * being placed. Mutations are optimistic — each swaps the server-acknowledged
 * placement into local state — and every success tells the page (`onChanged`),
 * which marks the bundle stale so the next visit re-reads it.
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
  // The key of the last placing action that did not come back with rows. The
  // same model × count placed again is that action retried, and must carry its
  // key: the batch may have landed with only the answer lost. Anything else, or
  // anything after a success, is a new action and gets a new key.
  const unsettled = useRef<{ modelSlug: string; total: number; key: string } | null>(null);

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
      const retried = unsettled.current;
      const action =
        retried?.modelSlug === modelSlug && retried.total === total
          ? retried
          : { modelSlug, total, key: crypto.randomUUID() };
      unsettled.current = action;
      setMutation(creating);
      setPlacing({ total });
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
        const items = Array.from({ length: total }, (_, i) => ({
          modelSlug,
          position: { x: i * step, y: 0, z: 0 },
          scale: { x: scale, y: scale, z: scale },
          visiblePanoramaIds: panoramaIds,
        }));
        // One transaction on the gateway: the batch lands whole or not at all,
        // so a refusal leaves nothing to show and nothing to mark stale. The
        // picker caps N at 99, under the endpoint's 100.
        const created = (await createPlacements(slug, items, action.key)).map(resolve);
        unsettled.current = null;
        startTransition(() => setPlacements((prev) => [...prev, ...created]));
        onChanged();
        return created.at(-1)?.id ?? null;
      } catch (err) {
        notify.error(messageOf(err));
        // A 409: the key already names another batch, and keeping it would
        // refuse every identical placement after this one.
        if (err instanceof HttpError && err.status === 409) unsettled.current = null;
        // No HTTP answer (a dropped line) or a 5xx (a proxy timing out after
        // the commit) means the batch may have landed anyway: mark the bundle
        // stale so the next visit shows it. Only a 4xx is a refusal.
        if (!(err instanceof HttpError) || err.status >= 500) onChanged();
        return null;
      } finally {
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
