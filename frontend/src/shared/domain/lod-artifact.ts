// LodArtifact is one entry of a converted LOD chain. The same source can
// produce several GLBs at different polygon counts (LOD0 = full quality,
// LOD1 ≈ 50%, LOD2 ≈ 25%, configurable on the backend). Each carries its
// own content-addressed hash so the browser caches every LOD independently.
export interface LodArtifact {
  lod: number;
  hash: string;
  size: number;
  vertices?: number;
  faces?: number;
}

// orderByPreferred returns the chain sorted by closeness to the requested
// LOD number. The first entry is the best match; the rest form the
// fallback ladder used by the LOD error boundary when a chosen LOD fails
// to load. Ties break toward higher quality (lower lod number).
export function orderByPreferred(
  chain: LodArtifact[],
  preferred: number,
): LodArtifact[] {
  return [...chain].sort((a, b) => {
    const dA = Math.abs(a.lod - preferred);
    const dB = Math.abs(b.lod - preferred);
    return dA - dB || a.lod - b.lod;
  });
}

// pickLod returns the requested LOD if present, otherwise the closest
// available entry. Returns null only when the chain is empty, which the
// caller treats as "asset not converted yet".
export function pickLod(
  chain: LodArtifact[],
  preferred = 0,
): LodArtifact | null {
  return chain.length === 0 ? null : orderByPreferred(chain, preferred)[0];
}
