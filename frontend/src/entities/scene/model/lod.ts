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
 * Decides both at once. Before the target has loaded, `held` — the level
 * already on screen when a finer target was asked for — stays up while the
 * target warms, or the coarsest entry when nothing is held (or the held level
 * left the chain, or is the target itself); afterwards the target is shown and
 * nothing warms. Keeping this pure is what makes the swap testable without WebGL.
 */
export function selectProgressive(
  chain: LodArtifact[],
  targetLod: number,
  ready: boolean,
  held: LodArtifact | null = null,
): ProgressiveSelection {
  const target = pickLod(chain, targetLod);
  if (target === null) return { show: null, warm: null };
  const coarsest = pickCoarsest(chain);
  if (ready || coarsest === null || coarsest.lod === target.lod) {
    return { show: target, warm: null };
  }
  const keep = held && held.hash !== target.hash && chain.some((a) => a.hash === held.hash);
  return { show: keep ? held : coarsest, warm: target };
}

/** What the reader chose: one level, or Auto — each object's level follows its size on screen. */
export type LodChoice = number | "auto";

/**
 * Screen pixels Auto allows per triangle: a triangle of about 4 px², an edge
 * of roughly 3 px.
 *
 * ponytail: one global density calibrated on dji-wp46-cut; the knob to turn if
 * Auto proves too eager or too lazy on real screens. A per-level geometric
 * error from the converter is the upgrade path (gltfpack does not report one).
 */
const PX_PER_TRIANGLE = 4;

/**
 * The screen area, in drawing-buffer px², of a bounding sphere seen from
 * `distance` through a perspective camera — Infinity with the camera inside it.
 * Past the screen's edge the visible share cancels out of the density (visible
 * area over visible triangles is still area over faces), so this stays right
 * zoomed into one corner of a territory.
 */
export function projectedArea(p: { radius: number; distance: number; fovDeg: number; heightPx: number }): number {
  if (p.distance <= p.radius) return Infinity;
  const px = (p.radius / (p.distance * Math.tan((p.fovDeg * Math.PI) / 360))) * (p.heightPx / 2);
  return Math.PI * px * px;
}

/**
 * The coarsest level with at least one triangle per `pxPerTriangle` of screen
 * area; the finest when none has, or when any level lacks a face count (an
 * unreadable GLB) — that is today's LOD 0, never a guess. Null for an empty chain.
 */
export function autoLod(chain: LodArtifact[], areaPx: number, pxPerTriangle = PX_PER_TRIANGLE): number | null {
  if (chain.length === 0) return null;
  const coarseFirst = [...chain].sort((a, b) => b.lod - a.lod);
  const finest = coarseFirst[coarseFirst.length - 1].lod;
  if (chain.some((a) => !a.faces)) return finest;
  const need = areaPx / pxPerTriangle;
  return coarseFirst.find((a) => (a.faces ?? 0) >= need)?.lod ?? finest;
}
