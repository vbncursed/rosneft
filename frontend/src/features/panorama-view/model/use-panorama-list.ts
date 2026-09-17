import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  deletePanorama,
  updatePanorama,
  type Panorama,
  type PanoramaUpdate,
} from "@/entities/panorama";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";

export type PanoramaListParams = {
  slug: string;
  initial: Panorama[];
  /** Every settled mutation calls this; the page refetches the scene bundle. */
  onChanged: () => void;
};

// usePanoramaList wraps the panorama list with optimistic local updates
// against the PUT endpoint. The initial array comes from the scene bundle;
// subsequent saves swap the local row with the server's echoed Panorama
// (carries fresh updatedAt for re-keying components).
//
// `update`'s identity is stable across renders — the current list is read via
// ref so the callback doesn't recapture on every CRUD. Without this, every
// panorama save would invalidate every downstream useMemo / useCallback that
// depends on `update`.
export function usePanoramaList({ slug, initial, onChanged }: PanoramaListParams) {
  const [panoramas, setPanoramas] = useState<Panorama[]>(initial);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const panoramasRef = useRef(panoramas);
  useEffect(() => {
    panoramasRef.current = panoramas;
  }, [panoramas]);

  const add = useCallback((p: Panorama) => setPanoramas((prev) => [...prev, p]), []);

  const update = useCallback(
    async (id: number, patch: Partial<PanoramaUpdate>) => {
      const current = panoramasRef.current.find((p) => p.id === id);
      if (!current) return;
      // The PUT replaces the row, so a one-field patch still travels as the
      // whole body or the gateway would zero what is absent.
      const body: PanoramaUpdate = {
        title: patch.title ?? current.title,
        position: patch.position ?? current.position,
        yawOffset: patch.yawOffset ?? current.yawOffset,
        defaultYaw: patch.defaultYaw ?? current.defaultYaw,
      };
      setPendingId(id);
      startTransition(() => {
        setPanoramas((prev) => prev.map((p) => (p.id === id ? { ...current, ...body } : p)));
      });
      try {
        const saved = await updatePanorama(slug, id, body);
        startTransition(() => {
          setPanoramas((prev) => prev.map((p) => (p.id === id ? saved : p)));
        });
        onChanged();
      } catch (err) {
        startTransition(() => {
          setPanoramas((prev) => prev.map((p) => (p.id === id ? current : p)));
        });
        notify.error(`Failed to update panorama: ${messageOf(err)}`);
      } finally {
        setPendingId(null);
      }
    },
    [slug, onChanged],
  );

  // Optimistically drop the row, then issue the DELETE. The removal is
  // immediate (not deferred via a transition) so the broken capture disappears
  // from the picker and unmounts its sphere the instant the user confirms; on
  // failure we restore the previous list and surface the error.
  const remove = useCallback(
    async (id: number) => {
      const prev = panoramasRef.current;
      setPendingId(id);
      setPanoramas((p) => p.filter((x) => x.id !== id));
      try {
        await deletePanorama(slug, id);
        notify.success("Panorama deleted");
      } catch (err) {
        setPanoramas(prev);
        notify.error(`Failed to delete panorama: ${messageOf(err)}`);
      } finally {
        // Both ways: a refused delete may mean the row is already gone for
        // another reason, and only the gateway can say. The page re-keys this
        // hook on the bundle it refetches — nothing here adopts a changed
        // `initial` on its own.
        onChanged();
        setPendingId(null);
      }
    },
    [slug, onChanged],
  );

  return { panoramas, pendingId, add, update, remove };
}
