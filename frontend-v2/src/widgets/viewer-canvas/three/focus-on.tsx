import { useBounds } from "@react-three/drei";
import { useEffect, type RefObject } from "react";
import type { Object3D } from "three";
import { boxOf } from "../model/focus-box";

/**
 * Refits drei's Bounds to a set of instances whenever a new request arrives.
 * `root` is the territory group; the placements are its siblings under the
 * same wrapper group, hence `.parent`.
 */
export default function FocusOn({
  root,
  request,
}: {
  root: RefObject<Object3D | null>;
  request: number[] | null;
}) {
  const bounds = useBounds();
  useEffect(() => {
    if (!request || !root.current) return;
    const box = boxOf(root.current.parent ?? root.current, request);
    if (box) bounds.refresh(box).fit();
  }, [request, root, bounds]);
  return null;
}
