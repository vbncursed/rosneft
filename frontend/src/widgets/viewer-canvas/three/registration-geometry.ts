import { BufferAttribute, type Mesh } from "three";

export type RegistrationGeometry = {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array | Uint32Array | null;
  matrix: number[];
};

/** Copies supported geometry for transfer; viewer-owned buffers stay attached. */
export function registrationGeometry(mesh: Mesh): RegistrationGeometry | null {
  const position = mesh.geometry.getAttribute("position"),
    uv = mesh.geometry.getAttribute("uv"),
    index = mesh.geometry.getIndex();
  if (
    !(position instanceof BufferAttribute) ||
    !(uv instanceof BufferAttribute) ||
    !(position.array instanceof Float32Array) ||
    !(uv.array instanceof Float32Array) ||
    position.itemSize !== 3 ||
    uv.itemSize !== 2 ||
    position.count !== uv.count ||
    (index && !(index.array instanceof Uint16Array) && !(index.array instanceof Uint32Array))
  )
    return null;
  // Keep worker memory bounded on unusually large uploads.
  const bytes = position.array.byteLength + uv.array.byteLength + (index?.array.byteLength ?? 0);
  if (bytes > 160 * 1024 * 1024) return null;
  mesh.updateWorldMatrix(true, false);
  return {
    positions: position.array.slice(),
    uvs: uv.array.slice(),
    indices: index ? (index.array as Uint16Array | Uint32Array).slice() : null,
    matrix: mesh.matrixWorld.toArray(),
  };
}
