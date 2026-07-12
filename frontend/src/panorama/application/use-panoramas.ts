import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  deletePanorama,
  updatePanorama,
} from "@/panorama/infrastructure/panorama-gateway";
import type { Panorama } from "@/panorama/domain/panorama";
import type { Vec3 } from "@/shared/domain/vec3";
import { formatError } from "@/shared/infrastructure/http/format-error";
import { notify } from "@/shared/presentation/toast/use-toast";

// usePanoramas wraps the panorama list with optimistic local updates
// against the PUT endpoint. The initial array comes from the server-side
// scene-bundle; subsequent saves swap the local row with the server's
// echoed Panorama (carries fresh updatedAt for re-keying components).
//
// `update`'s identity is stable across renders — the current list is
// read via ref so the callback doesn't recapture on every CRUD. Without
// this, every panorama save would invalidate every downstream useMemo /
// useCallback that depends on `update`.
export function usePanoramas(territorySlug: string, initial: Panorama[]) {
  const [panoramas, setPanoramas] = useState<Panorama[]>(initial);
  const [, startTransition] = useTransition();

  const panoramasRef = useRef(panoramas);
  useEffect(() => {
    panoramasRef.current = panoramas;
  }, [panoramas]);

  const update = useCallback(
    async (id: number, patch: { title?: string; position?: Vec3; yawOffset?: number; defaultYaw?: number }) => {
      const current = panoramasRef.current.find((p) => p.id === id);
      if (!current) return;
      const optimistic: Panorama = {
        ...current,
        title: patch.title ?? current.title,
        position: patch.position ?? current.position,
        yawOffset: patch.yawOffset ?? current.yawOffset,
        defaultYaw: patch.defaultYaw ?? current.defaultYaw,
      };
      startTransition(() => {
        setPanoramas((prev) => prev.map((p) => (p.id === id ? optimistic : p)));
      });
      try {
        const saved = await updatePanorama(territorySlug, id, {
          title: optimistic.title,
          position: optimistic.position,
          yawOffset: optimistic.yawOffset,
          defaultYaw: optimistic.defaultYaw,
        });
        startTransition(() => {
          setPanoramas((prev) => prev.map((p) => (p.id === id ? saved : p)));
        });
      } catch (err) {
        startTransition(() => {
          setPanoramas((prev) => prev.map((p) => (p.id === id ? current : p)));
        });
        notify.error(`Failed to update panorama: ${formatError(err)}`);
      }
    },
    [territorySlug],
  );

  // Optimistically drop the row, then issue the DELETE. The removal is
  // immediate (not deferred via a transition) so the broken capture
  // disappears from the picker and unmounts its sphere the instant the
  // user confirms; on failure we restore the previous list and surface
  // the error.
  const remove = useCallback(
    async (id: number) => {
      const prev = panoramasRef.current;
      setPanoramas((p) => p.filter((x) => x.id !== id));
      try {
        await deletePanorama(territorySlug, id);
        notify.success("Panorama deleted");
      } catch (err) {
        setPanoramas(prev);
        notify.error(`Failed to delete panorama: ${formatError(err)}`);
      }
    },
    [territorySlug],
  );

  return { panoramas, update, remove };
}
