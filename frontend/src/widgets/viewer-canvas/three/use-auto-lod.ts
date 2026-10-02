import { useEffect, useRef, useState, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import type { Object3D, PerspectiveCamera } from "three";
import { autoLod, pickCoarsest, projectedArea, type LodArtifact, type LodChoice } from "@/entities/scene";
import { useAutoLodBus } from "./settle-bus";
import { boundsOf } from "./bounds";

export { SETTLE_MS } from "./settle-bus";

/** Drawn at all: three has no world-visibility flag, so walk the parents. */
const isShown = (object: Object3D) => {
  for (let node: Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
  return true;
};

/**
 * The level an object should load, from its size on screen.
 *
 * When the view is read is the scene's AutoLodClock's business (see
 * createSettleBus): SETTLE_MS after the camera stops, never mid-gesture, and
 * on the next rendered frame for an object that had nothing to measure yet.
 * The fly-around moves the camera in its own rAF without firing "change", so
 * it arms no re-read while it runs — an object still owed a measure when it
 * began is read on the first frame it can be, mid-flight, from wherever the
 * flight has the camera — but its landing calls controls.update(), and that
 * "change" re-arms every measure where the camera ends up. A Focus needs no
 * such nudge: drei's Bounds ends fit() with controls.update() (the
 * `t.current >= 1` branch in drei 10.7.9), which fires "change" the same way. This hook watches only while there is something to
 * gain: in Auto, below the finest level of its chain.
 *
 * The level only ever gets finer — a coarser one saves no bytes that were not
 * already spent, and lowering useProgressiveLod's target would put the
 * coarsest level back on screen for a whole download. A numeric `requested`
 * (a manual level, or the page's LOD 0 while measuring) is returned as is and
 * joins that ratchet, so Auto keeps what measuring pulled in. A new chain
 * starts over; the same hashes in another order are the same chain.
 */
export function useAutoLod(object: RefObject<Object3D | null>, chain: LodArtifact[], requested: LodChoice): number {
  const key = chain
    .map((a) => a.hash)
    .toSorted()
    .join(" ");
  const coarsest = pickCoarsest(chain)?.lod ?? 0;
  const [held, setHeld] = useState({ key, best: coarsest });
  const base = held.key === key ? held.best : coarsest;
  const best = typeof requested === "number" ? Math.min(base, requested) : base;
  // Adjusted during render, as useProgressiveLod does with its target: an
  // effect would let one frame run on the stale level first.
  if (held.key !== key || held.best !== best) setHeld({ key, best });

  const bus = useAutoLodBus();
  const camera = useThree((s) => s.camera);
  const height = useThree((s) => s.size.height * s.viewport.dpr);
  const view = useRef({ chain, camera, height });
  useEffect(() => {
    view.current = { chain, camera, height };
  });

  const auto = requested === "auto";
  // At the finest level there is nothing left to upgrade to: stop watching.
  const finest = Math.min(...chain.map((a) => a.lod));
  useEffect(() => {
    if (!auto || best === finest) return;
    return bus.watch(() => {
      const o = object.current;
      const sphere = o && isShown(o) ? boundsOf(o) : null;
      if (!sphere) return false;
      const seen = view.current;
      const cam = seen.camera as PerspectiveCamera;
      if (!cam.isPerspectiveCamera) return true;
      const area = projectedArea({
        radius: sphere.radius,
        distance: cam.position.distanceTo(sphere.center),
        fovDeg: cam.fov,
        heightPx: seen.height,
      });
      const lod = autoLod(seen.chain, area);
      if (lod !== null) setHeld((h) => (h.key === key && lod < h.best ? { key, best: lod } : h));
      return true;
    });
  }, [auto, best, finest, bus, object, key]);

  return typeof requested === "number" ? requested : best;
}
