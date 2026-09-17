import { useBounds } from "@react-three/drei";
import { useEffect, type RefObject } from "react";
import type { Object3D } from "three";
import { boxOf } from "../model/focus-box";

/**
 * Refits drei's Bounds to a set of instances whenever a new request arrives.
 *
 * `root` is the scene wrapper, not the territory: `<Bounds>` renders a group of
 * its own, so the territory's parent is that group and a frame resolved from it
 * can never reach a placement, which is the wrapper's child one level up.
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
    const box = boxOf(root.current, request);
    if (box) bounds.refresh(box).fit();
  }, [request, root, bounds]);
  return null;
}
