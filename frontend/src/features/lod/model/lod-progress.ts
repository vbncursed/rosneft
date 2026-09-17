import type { LodArtifact } from "@/entities/scene";

// Binary megabytes, like `formatBytes` and every size the design mocks print
// ("9.8 MB" is the same LOD0 file the artifact row labels that way). One
// decimal always, so the chip's number does not jump width mid-download.
const mb = (bytes: number) => (bytes / 1_048_576).toFixed(1);

/** The loading chip's numbers: percent of the target and megabytes so far over its size. */
export function lodProgress(received: number, total: number): { percent: number; text: string } {
  if (total <= 0) return { percent: 0, text: `${mb(received)} MB` };
  return {
    percent: Math.min(100, Math.round((received / total) * 100)),
    text: `${mb(received)} / ${mb(total)} MB`,
  };
}

export type LodFailure = { hash: string; status: number | null };

export type ViewerError = {
  lod: number;
  status: number | null;
  /** The file name the mock prints: `{slug}-lod{n}.glb`. */
  file: string;
  /** The next coarser level still in the chain, offered as the way out; null when there is none. */
  coarser: LodArtifact | null;
};

/**
 * What the error card says when the level on screen failed.
 *
 * Every fact comes from the level the failure names, not from the target.
 * Before the swap those are different levels — the coarse one is on screen
 * while LOD 0 warms behind it — so reading the target would name the wrong
 * level, print the wrong file, and offer the level that just failed as the way
 * out of its own failure.
 */
export function viewerError(
  failure: LodFailure | null,
  chain: LodArtifact[],
  target: LodArtifact | null,
  slug: string,
): ViewerError | null {
  if (!failure || !target) return null;
  const failed = chain.find((a) => a.hash === failure.hash) ?? target;
  const coarser = chain.filter((a) => a.lod > failed.lod).sort((a, b) => b.lod - a.lod)[0] ?? null;
  return { lod: failed.lod, status: failure.status, file: `${slug}-lod${failed.lod}.glb`, coarser };
}
