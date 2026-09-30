import { useEffect, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { Object3D, PerspectiveCamera } from "three";
import { autoLod, pickCoarsest, projectedArea, type LodArtifact, type LodChoice } from "@/entities/scene";
import { boundsOf } from "./bounds";

/** How long the camera holds still before Auto reads the view again. */
export const SETTLE_MS = 250;

type Listenable = {
  addEventListener: (type: "change", listener: () => void) => void;
  removeEventListener: (type: "change", listener: () => void) => void;
};

/** Drawn at all: three has no world-visibility flag, so walk the parents. */
const isShown = (object: Object3D) => {
  for (let node: Object3D | null = object; node; node = node.parent) if (!node.visible) return false;
  return true;
};

/**
 * The level an object should load, from its size on screen.
 *
 * Re-read SETTLE_MS after the camera stops (controls "change"), never mid-
 * gesture, so a zoom that sweeps through a close-up fetches nothing; the
 * fly-around never settles and so never upgrades. The level only ever gets
 * finer — a coarser one saves no bytes that were not already spent, and
 * lowering useProgressiveLod's target would put the coarsest level back on
 * screen for a whole download. A numeric `requested` (a manual level, or the
 * page's LOD 0 while measuring) is returned as is and joins that ratchet, so
 * Auto keeps what measuring pulled in. A new chain starts over; the same
 * hashes in another order are the same chain.
 *
 * An object with nothing to measure yet (its mesh still loading, or hidden
 * inside a panorama) is retried on the next rendered frame rather than on a
 * timer. Under frameloop="demand" R3F draws a frame for exactly the changes
 * that can make it measurable — a mesh mounting, a `visible` prop flipping —
 * so an idle scene runs nothing. The retry is dropped when it succeeds, when a
 * camera move re-arms the settle (never measure mid-gesture), and when Auto
 * stops: leaving it, reaching the finest level, unmounting.
 */
export function useAutoLod(object: RefObject<Object3D | null>, chain: LodArtifact[], requested: LodChoice): number {
  const key = chain.map((a) => a.hash).toSorted().join(" ");
  const coarsest = pickCoarsest(chain)?.lod ?? 0;
  const [held, setHeld] = useState({ key, best: coarsest });
  const base = held.key === key ? held.best : coarsest;
  const best = typeof requested === "number" ? Math.min(base, requested) : base;
  // Adjusted during render, as useProgressiveLod does with its target: an
  // effect would let one frame run on the stale level first.
  if (held.key !== key || held.best !== best) setHeld({ key, best });

  const camera = useThree((s) => s.camera);
  // R3F types controls as a bare EventDispatcher whose event map has no
  // "change"; OrbitControls (CameraRig) and the spec's fake both fire it.
  const controls = useThree((s) => s.controls) as unknown as Listenable | null;
  const height = useThree((s) => s.size.height * s.viewport.dpr);
  const view = useRef({ chain, camera, height });
  useEffect(() => {
    view.current = { chain, camera, height };
  });

  // The measure still owed; one null check per frame when there is none.
  const retry = useRef<(() => void) | null>(null);
  useFrame(() => retry.current?.());

  const auto = requested === "auto";
  // At the finest level there is nothing left to upgrade to: stop listening.
  const finest = Math.min(...chain.map((a) => a.lod));
  useEffect(() => {
    if (!auto || best === finest) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      retry.current = null;
      clearTimeout(timer);
      timer = setTimeout(measure, SETTLE_MS);
    };
    const measure = () => {
      const o = object.current;
      const sphere = o && isShown(o) ? boundsOf(o) : null;
      retry.current = sphere ? null : measure;
      if (!sphere) return;
      const { chain, camera, height } = view.current;
      const cam = camera as PerspectiveCamera;
      if (!cam.isPerspectiveCamera) return;
      const area = projectedArea({
        radius: sphere.radius,
        distance: cam.position.distanceTo(sphere.center),
        fovDeg: cam.fov,
        heightPx: height,
      });
      const lod = autoLod(chain, area);
      if (lod !== null) setHeld((h) => (h.key === key && lod < h.best ? { key, best: lod } : h));
    };
    settle();
    controls?.addEventListener("change", settle);
    return () => {
      clearTimeout(timer);
      retry.current = null;
      controls?.removeEventListener("change", settle);
    };
  }, [auto, best, finest, controls, object, key]);

  return typeof requested === "number" ? requested : best;
}
