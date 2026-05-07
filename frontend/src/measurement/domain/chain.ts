import type { Measurement, MeasurePoint } from "@/measurement/domain/measurement";

// Chain is the measurement aggregate. A user clicks a sequence of points
// on visible surfaces; consecutive points form segments. A chain may be
// open (the last point is the "tip" of an extending polyline) or closed
// (the last segment loops back to the first point — useful for
// perimeter measurement on closed shapes).
//
// Invariants:
//   - points.length >= 1 for any persisted chain
//   - closed === true requires points.length >= 3 (you need at least a
//     triangle for a closed loop)
export interface Chain {
  id: number;
  points: MeasurePoint[];
  closed: boolean;
}

// World-space distance below which a click counts as "the same point as
// the chain start" → close the loop. Scene is normalised to max-axis = 2
// (per converter), so 0.04 ≈ 2% of the scene's max extent — tight enough
// not to trigger on accidental near-clicks, wide enough to hit on
// trackpad and after camera moves.
export const CLOSE_TOLERANCE = 0.04;

// pointDistance is the local inline of Vec3 distance — the domain layer
// stays free of three.js, so we keep it tiny and dependency-free.
function pointDistance(a: MeasurePoint, b: MeasurePoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// shouldCloseAt decides whether a fresh click on `point` should close
// the active chain instead of appending. Requires ≥3 existing points —
// only a triangle or larger has a meaningful "close into a loop" state.
// With <3 points closeChain would be a no-op, but the reducer would
// still flip activeChainId to null and lose the click; gating here
// prevents that whole class of off-by-one bug.
export function shouldCloseAt(chain: Chain, point: MeasurePoint): boolean {
  if (chain.closed) return false;
  if (chain.points.length < 3) return false;
  return pointDistance(chain.points[0], point) <= CLOSE_TOLERANCE;
}

export function appendPoint(chain: Chain, point: MeasurePoint): Chain {
  return { ...chain, points: [...chain.points, point] };
}

export function closeChain(chain: Chain): Chain {
  if (chain.closed || chain.points.length < 3) return chain;
  return { ...chain, closed: true };
}

// chainSegments derives the renderable Measurement[] for a chain. For an
// open chain of N points it emits N-1 segments; for a closed chain it
// emits N segments, the last one looping back to point 0. The segment
// id is stable per (chainId, segmentIndex) — segmentIndex matches the
// `a` point's index in chain.points.
export function chainSegments(chain: Chain): Measurement[] {
  const segments: Measurement[] = [];
  const lastIndex = chain.closed ? chain.points.length : chain.points.length - 1;
  for (let i = 0; i < lastIndex; i++) {
    const a = chain.points[i];
    const b = chain.points[(i + 1) % chain.points.length];
    segments.push({ id: encodeSegmentId(chain.id, i), a, b });
  }
  return segments;
}

// Segment id pack/unpack — keeps Measurement.id numeric (avoids changing
// the shape) while encoding chainId and segmentIndex for callbacks.
// 16-bit segmentIndex is more than enough; we shift chainId left by 16.
const SEGMENT_INDEX_BITS = 16;
const SEGMENT_INDEX_MASK = (1 << SEGMENT_INDEX_BITS) - 1;

export function encodeSegmentId(chainId: number, segmentIndex: number): number {
  return (chainId << SEGMENT_INDEX_BITS) | (segmentIndex & SEGMENT_INDEX_MASK);
}

export function decodeSegmentId(segmentId: number): {
  chainId: number;
  segmentIndex: number;
} {
  return {
    chainId: segmentId >>> SEGMENT_INDEX_BITS,
    segmentIndex: segmentId & SEGMENT_INDEX_MASK,
  };
}

// removeSegment removes the segment at segmentIndex from the chain.
//   - Closed chain: opens up at that segment. Result is one chain whose
//     points are rotated so the gap sits at the end (the chain reads
//     start → ... → end with the removed segment "missing"). Returns
//     [resultChain].
//   - Open chain: splits into the prefix before the removed segment and
//     the suffix after it. Each side becomes its own open chain. Empty
//     sides (segment at the very start or end) collapse to a chain of a
//     single point — those are dropped because a 1-point chain has no
//     visible segments to interact with.
//
// New chain ids come from the caller (we don't allocate ids in the
// domain layer); pass the next two ids as `nextIds`.
export function removeSegment(
  chain: Chain,
  segmentIndex: number,
  nextIds: [number, number],
): Chain[] {
  const n = chain.points.length;
  if (segmentIndex < 0) return [chain];

  if (chain.closed) {
    if (segmentIndex >= n) return [chain];
    // Rotate so the kept points read start..end with the gap closed.
    // A closed chain's segment i goes from points[i] to points[(i+1)%n].
    // Removing segment i means points[i+1..n-1, 0..i] become the new
    // open chain — points[i+1] is the new start, points[i] is the new end.
    const rotated = [
      ...chain.points.slice(segmentIndex + 1),
      ...chain.points.slice(0, segmentIndex + 1),
    ];
    return [{ id: nextIds[0], points: rotated, closed: false }];
  }

  if (segmentIndex >= n - 1) return [chain];
  // Open chain: split into [0..segmentIndex] and [segmentIndex+1..n-1].
  const left = chain.points.slice(0, segmentIndex + 1);
  const right = chain.points.slice(segmentIndex + 1);
  const result: Chain[] = [];
  if (left.length >= 2) result.push({ id: nextIds[0], points: left, closed: false });
  if (right.length >= 2) result.push({ id: nextIds[1], points: right, closed: false });
  return result;
}
