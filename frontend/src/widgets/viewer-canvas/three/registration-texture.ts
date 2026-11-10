import { Matrix3, Mesh, type Material, type Object3D, type Texture } from "three";

export function textureFor(mesh: Mesh): Texture | null {
  if (Array.isArray(mesh.material) || !mesh.geometry.getAttribute("uv") || !mesh.geometry.getAttribute("position"))
    return null;
  const texture = (mesh.material as Material & { map?: Texture | null }).map;
  if (!texture || texture.channel !== 0) return null;
  if (texture.matrixAutoUpdate) texture.updateMatrix();
  return texture.matrix.equals(new Matrix3()) ? texture : null;
}

/** Only a single, unambiguously textured mesh can currently be registered. */
export function findRegistrationMesh(root: Object3D): Mesh | null {
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh && textureFor(object)) meshes.push(object);
  });
  return meshes.length === 1 ? meshes[0] : null;
}
