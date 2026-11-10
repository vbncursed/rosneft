import type { ImageMatch } from "./orb-ransac";

/** Reject concentrated matches and retain at most twenty well-separated correspondences. */
export function spreadMatches(matches: ImageMatch[], size: { width: number; height: number }): ImageMatch[] {
  if (matches.length < 12 || size.width <= 0 || size.height <= 0) return [];
  const xs = matches.map((m) => m.source.x),
    ys = matches.map((m) => m.source.y);
  if (Math.max(...xs) - Math.min(...xs) < size.width * 0.15 || Math.max(...ys) - Math.min(...ys) < size.height * 0.15)
    return [];
  const remaining = [...matches],
    selected = [remaining.shift()!];
  const distance = (m: ImageMatch) =>
    Math.min(
      ...selected.map(
        (p) => ((p.source.x - m.source.x) / size.width) ** 2 + ((p.source.y - m.source.y) / size.height) ** 2,
      ),
    );
  while (selected.length < 20 && remaining.length) {
    let best = 0;
    for (let i = 1; i < remaining.length; i++) if (distance(remaining[i]) > distance(remaining[best])) best = i;
    selected.push(remaining.splice(best, 1)[0]);
  }
  return selected;
}
