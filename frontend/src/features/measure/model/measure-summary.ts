import { chainSegments, formatDistance, type Chain } from "@/entities/measurement";

const length = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** The mode chip's numbers: how many segments are drawn, and their sum in source units. */
export function measureSummary(chains: Chain[], unitRatio: number): { segments: number; total: string } {
  const segments = chains.flatMap(chainSegments);
  const sum = segments.reduce((acc, s) => acc + length(s.a, s.b), 0);
  // formatDistance's metric branch only reaches "m" at abs >= 1, so a true
  // zero (nothing measured yet) falls to its mm bucket ("0 mm") instead of
  // reading as a clean zero — spell it out directly for the empty case.
  const total = segments.length === 0 ? `0.00 ${unitRatio === 1 ? "u" : "m"}` : formatDistance(sum * unitRatio, unitRatio);
  return { segments: segments.length, total };
}

/**
 * Whether the chip should say the reader's last finished chain is not on the
 * server: a reader without `measurement:create` drew it, or its save failed.
 * The chain still being drawn is not judged — nothing is sent until it ends.
 */
export function notSaved(chains: Chain[], activeChainId: number | null, canCreate: boolean): boolean {
  const last = chains.filter((c) => c.id !== activeChainId).at(-1);
  if (!last) return false;
  return last.sync === "failed" || (!canCreate && last.serverId == null);
}
