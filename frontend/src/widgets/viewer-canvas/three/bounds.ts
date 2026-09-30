import { Box3, Sphere, type Object3D } from "three";

/** The object's world bounding sphere, or null when there is nothing with a size to measure. */
export function boundsOf(object: Object3D | null): Sphere | null {
  if (!object) return null;
  const sphere = new Box3().setFromObject(object).getBoundingSphere(new Sphere());
  return sphere.radius > 0 && Number.isFinite(sphere.radius) ? sphere : null;
}
