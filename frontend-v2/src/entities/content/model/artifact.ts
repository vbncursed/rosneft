export type Vec3 = { x: number; y: number; z: number };

/** One converted LOD: what the catalogs, the model page and the artifact rows read. */
export type Artifact = {
  lod: number;
  hash: string;
  size: number;
  vertices: number;
  faces: number;
  bboxMin: Vec3;
  bboxMax: Vec3;
};

/** "LOD 0-2", "LOD 0", or "—" when nothing has been converted. */
export function lodLabel(artifacts: Artifact[]): string {
  if (artifacts.length === 0) return "—";
  const lods = artifacts.map((a) => a.lod);
  const lo = Math.min(...lods);
  const hi = Math.max(...lods);
  return lo === hi ? `LOD ${lo}` : `LOD ${lo}-${hi}`;
}

export const totalSize = (artifacts: Artifact[]): number =>
  artifacts.reduce((sum, a) => sum + a.size, 0);
