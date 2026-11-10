import { describeImage } from "./orb-features";
import { matchDescriptors } from "./orb-match";
import { fitImageMatches, type ImageMatch } from "./orb-ransac";

type GrayImage = { data: Uint8Array; width: number; height: number };

/** Matches both parities and returns inliers in the original image coordinates. */
export function matchImages(source: GrayImage, target: GrayImage): ImageMatch[] {
  const first = describeImage(source.data, source.width, source.height);
  if (first.points.length < 12) return [];
  let best: ImageMatch[] = [];
  for (const flip of [false, true]) {
    const data = flip ? new Uint8Array(target.data.length) : target.data;
    if (flip)
      for (let y = 0; y < target.height; y++)
        data.set(
          target.data.subarray(y * target.width, (y + 1) * target.width),
          (target.height - 1 - y) * target.width,
        );
    const second = describeImage(data, target.width, target.height);
    const matches = matchDescriptors(first.descriptors, second.descriptors).map((m) => ({
      source: first.points[m.query],
      target: second.points[m.target],
    }));
    const inliers = fitImageMatches(matches, Math.max(1.5, (Math.max(target.width, target.height) * 1.5) / 2048));
    if (inliers.length > best.length)
      best = inliers.map((m) => ({
        source: m.source,
        target: { x: m.target.x, y: flip ? target.height - 1 - m.target.y : m.target.y },
      }));
  }
  return best;
}
