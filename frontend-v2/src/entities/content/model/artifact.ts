/** What the catalog needs from one converted LOD — nothing else is read. */
export type Artifact = { lod: number; size: number };

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
