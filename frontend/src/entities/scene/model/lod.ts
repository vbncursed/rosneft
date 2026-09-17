/**
 * One entry of a converted LOD chain. The same source can produce several
 * GLBs at different polygon counts (LOD0 = full quality, LOD1 ≈ 50%,
 * LOD2 ≈ 25%, configurable on the backend). Each carries its own
 * content-addressed hash so the browser caches every LOD independently.
 */
export type LodArtifact = {
  lod: number;
  hash: string;
  size: number;
  vertices?: number;
  faces?: number;
};

/**
 * The chain sorted by closeness to the requested LOD number. The first entry
 * is the best match; the rest form the fallback ladder a level that fails to
 * load drops out of. Ties break toward higher quality (lower lod number).
 */
export function orderByPreferred(chain: LodArtifact[], preferred: number): LodArtifact[] {
  return [...chain].sort((a, b) => {
    const dA = Math.abs(a.lod - preferred);
    const dB = Math.abs(b.lod - preferred);
    return dA - dB || a.lod - b.lod;
  });
}

/**
 * The requested LOD if present, otherwise the closest available entry. Null
 * only when the chain is empty, which the caller treats as "not converted yet".
 */
export function pickLod(chain: LodArtifact[], preferred = 0): LodArtifact | null {
  return chain.length === 0 ? null : orderByPreferred(chain, preferred)[0];
}

/**
 * The entry with the highest lod number — the cheapest thing in the chain to
 * download, and therefore what a progressive load shows first. Null only when
 * the chain is empty.
 */
export function pickCoarsest(chain: LodArtifact[]): LodArtifact | null {
  return chain.reduce<LodArtifact | null>(
    (best, a) => (best === null || a.lod > best.lod ? a : best),
    null,
  );
}

/**
 * What is on screen, split from what is downloading behind it. `warm` is null
 * whenever there is nothing left to upgrade to — either because the target
 * already arrived, or because it IS the coarsest.
 */
export type ProgressiveSelection = {
  show: LodArtifact | null;
  warm: LodArtifact | null;
};

/**
 * Decides both at once. Before the target has loaded, the coarsest entry is
 * shown and the target warms; afterwards the target is shown and nothing
 * warms. Keeping this pure is what makes the swap testable without WebGL.
 */
export function selectProgressive(
  chain: LodArtifact[],
  targetLod: number,
  ready: boolean,
): ProgressiveSelection {
  const target = pickLod(chain, targetLod);
  if (target === null) return { show: null, warm: null };
  const coarsest = pickCoarsest(chain);
  if (ready || coarsest === null || coarsest.lod === target.lod) {
    return { show: target, warm: null };
  }
  return { show: coarsest, warm: target };
}
