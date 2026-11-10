type Pt = { x: number; y: number };

export type ImageMatch = { source: Pt; target: Pt };

/** RANSAC for a rotation, uniform scale and translation, with no reflection. */
export function fitImageMatches(matches: ImageMatch[], threshold: number): ImageMatch[] {
  if (matches.length < 12 || !Number.isFinite(threshold) || threshold <= 0) return [];
  let seed = 0x5f3759df;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  let best: ImageMatch[] = [];
  for (let iteration = 0; iteration < 2000; iteration++) {
    const p = matches[Math.floor((random() / 0x100000000) * matches.length)],
      q = matches[Math.floor((random() / 0x100000000) * matches.length)];
    const dx = q.source.x - p.source.x,
      dy = q.source.y - p.source.y;
    const length = dx * dx + dy * dy;
    if (length < 100) continue;
    const tx = q.target.x - p.target.x,
      ty = q.target.y - p.target.y;
    const c = (tx * dx + ty * dy) / length,
      s = (ty * dx - tx * dy) / length;
    const ox = p.target.x - c * p.source.x + s * p.source.y;
    const oy = p.target.y - s * p.source.x - c * p.source.y;
    const inliers = matches.filter((m) => {
      const x = c * m.source.x - s * m.source.y + ox - m.target.x;
      const y = s * m.source.x + c * m.source.y + oy - m.target.y;
      return x * x + y * y <= threshold * threshold;
    });
    if (inliers.length > best.length) best = inliers;
  }
  return best.length >= Math.max(12, matches.length * 0.15) ? best : [];
}
