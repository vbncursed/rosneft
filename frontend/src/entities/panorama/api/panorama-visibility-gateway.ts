import { httpPut } from "@/shared/api";
import type { components } from "@/shared/api/dto";
import { ALL_PHASES_SHOWN, type PanoramaPhase, type PhaseHidden } from "../model/panorama";

type PhaseDto = components["schemas"]["PanoramaPhase"];
type UpdatedDto = components["schemas"]["PanoramasUpdated"];

const base = (slug: string) => `/api/territories/${encodeURIComponent(slug)}`;

/** One transaction over every id (1–1000), all or nothing; the answer is how many rows changed. */
export async function setPanoramasHidden(slug: string, ids: number[], hidden: boolean): Promise<number> {
  return (await httpPut<UpdatedDto>(`${base(slug)}/panoramas/hidden`, { ids, hidden })).updated;
}

/** Moves every id into one phase, in one transaction. */
export async function setPanoramasPhase(slug: string, ids: number[], phase: PanoramaPhase): Promise<number> {
  return (await httpPut<UpdatedDto>(`${base(slug)}/panoramas/phase`, { ids, phase })).updated;
}

/** The phase's own flag — its panoramas keep theirs (D5). Resolves to the flag as stored. */
export async function setPanoramaPhaseHidden(slug: string, phase: PanoramaPhase, hidden: boolean): Promise<boolean> {
  return (await httpPut<PhaseDto>(`${base(slug)}/panorama-phases/${phase}`, { hidden })).hidden;
}

/**
 * The bundle's three rows (prior → current → post) as a lookup. A bundle saved
 * before phases existed — the desktop shell replays /scene offline — has none:
 * every phase shown.
 */
export function toPhaseHidden(rows: readonly PhaseDto[] | undefined): PhaseHidden {
  const out = { ...ALL_PHASES_SHOWN };
  for (const row of rows ?? []) out[row.phase] = row.hidden;
  return out;
}
