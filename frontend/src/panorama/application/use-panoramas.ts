import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { updatePanorama } from "@/panorama/infrastructure/panorama-gateway";
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
    async (id: number, patch: { title?: string; position?: Vec3; yawOffset?: number }) => {
      const current = panoramasRef.current.find((p) => p.id === id);
      if (!current) return;
      const optimistic: Panorama = {
        ...current,
        title: patch.title ?? current.title,
        position: patch.position ?? current.position,
        yawOffset: patch.yawOffset ?? current.yawOffset,
      };
      startTransition(() => {
        setPanoramas((prev) => prev.map((p) => (p.id === id ? optimistic : p)));
      });
      try {
        const saved = await updatePanorama(territorySlug, id, {
          title: optimistic.title,
          position: optimistic.position,
          yawOffset: optimistic.yawOffset,
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

  return { panoramas, update };
}
