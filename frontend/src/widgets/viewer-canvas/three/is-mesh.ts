import type { Mesh, Object3D } from "three";

export function isMesh(object: Object3D): object is Mesh {
  return "isMesh" in object && object.isMesh === true;
}
