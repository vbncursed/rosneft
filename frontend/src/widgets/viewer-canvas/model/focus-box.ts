import { Box3, type Object3D } from "three";

/** The bounds of the named placement instances, for the camera to frame. */
export function boxOf(root: Object3D, ids: number[]): Box3 | null {
  const wanted = new Set(ids);
  const box = new Box3();
  let any = false;
  root.traverse((o) => {
    if (wanted.has(o.userData.placementId as number)) {
      box.expandByObject(o);
      any = true;
    }
  });
  return any ? box : null;
}
