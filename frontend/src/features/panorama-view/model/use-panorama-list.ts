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
  /** Every settled mutation calls this; the page marks the scene bundle stale. */
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
        // Functional, reading `prev` rather than the `current` snapshot:
        // `panoramasRef` only catches up in an effect after a render commits,
        // so a hide or move queued in the same tick as this call is invisible
        // to `current` and would otherwise be undone by this very write.
        setPanoramas((prev) => prev.map((p) => (p.id === id ? { ...p, ...body } : p)));
      });
      try {
        const saved = await updatePanorama(slug, id, body);
        startTransition(() => {
          // The PUT never carries hidden/phase — separate routes own them
          // (usePanoramaVisibility) — so a hide or a phase move that landed
          // while this save was in flight must survive the server's echo.
          setPanoramas((prev) => prev.map((p) => (p.id === id ? { ...saved, hidden: p.hidden, phase: p.phase } : p)));
        });
        onChanged();
      } catch (err) {
        startTransition(() => {
          // Roll back only the fields this PUT sent, read from the current
          // row (not the pre-call snapshot) — resetting the whole row would
          // also undo a hide or phase move that landed meanwhile.
          setPanoramas((prev) =>
            prev.map((p) =>
              p.id === id
                ? { ...p, title: current.title, position: current.position, yawOffset: current.yawOffset, defaultYaw: current.defaultYaw }
                : p,
            ),
          );
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
        // another reason, and only the gateway can say. The page marks the
        // bundle stale and the next visit seeds from a fresh one — nothing
        // here adopts a changed `initial` on its own.
        onChanged();
        setPendingId(null);
      }
    },
    [slug, onChanged],
  );

  return { panoramas, pendingId, add, update, remove, setPanoramas };
}
