import { PANORAMA_PHASES, type PanoramaPhase, type PhaseHidden } from "@/entities/panorama";

export type PhaseSection<R> = { phase: PanoramaPhase; label: string; hidden: boolean; rows: R[] };

/**
 * The Panoramas list's groups, in phase order (spec §3). An editor gets all
 * three: an empty phase is still somewhere to move a capture, and a hidden one
 * is still theirs to show again. Anyone else gets only the phases that are
 * shown and hold something — their rows already exclude hidden captures.
 */
export function phaseSections<R extends { phase: PanoramaPhase }>(
  rows: readonly R[],
  hidden: PhaseHidden,
  canWrite: boolean,
): PhaseSection<R>[] {
  return PANORAMA_PHASES.map(({ phase, label }) => ({
    phase,
    label,
    hidden: hidden[phase],
    rows: rows.filter((r) => r.phase === phase),
  })).filter((s) => canWrite || s.rows.length > 0);
}
