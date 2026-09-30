import { useCallback, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import {
  setPanoramaPhaseHidden,
  setPanoramasHidden,
  setPanoramasPhase,
  type Panorama,
  type PanoramaPhase,
  type PhaseHidden,
} from "@/entities/panorama";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";

export type PanoramaVisibilityParams = {
  slug: string;
  /** `usePanoramaList`'s own setter: a landed write patches the same list the viewer draws. */
  setPanoramas: Dispatch<SetStateAction<Panorama[]>>;
  /** The bundle's phase flags, seeded once like every list on the viewer. */
  initialPhaseHidden: PhaseHidden;
  /** Every landed write calls this; the page marks the scene bundle stale. */
  onChanged: () => void;
};

type Patch = Partial<Pick<Panorama, "hidden" | "phase">>;

/**
 * The panorama list's shared-visibility writes (spec §3): hide or show
 * captures, move them between job phases, and hide or show a whole phase.
 * Nothing is optimistic — the gateway answers only a count, so a landed write
 * applies the patch it sent; a refusal changes nothing and says why.
 *
 * Each id write holds its own copy of the ids and drops exactly that copy,
 * so two overlapping writes never release each other's rows. A phase's flag
 * is the phase's (D5): setting it touches no panorama.
 */
// ponytail: the id-write half repeats `useBulkWrites` (features/placements-editor);
// lift it into shared/lib if a third list ever needs the same shape.
export function usePanoramaVisibility({ slug, setPanoramas, initialPhaseHidden, onChanged }: PanoramaVisibilityParams) {
  const [inFlight, setInFlight] = useState<readonly number[][]>([]);
  const [phaseHidden, setPhaseHiddenState] = useState<PhaseHidden>(initialPhaseHidden);
  const [pendingPhases, setPendingPhases] = useState<readonly PanoramaPhase[]>([]);
  const [, startTransition] = useTransition();

  const write = useCallback(
    async (ids: number[], send: () => Promise<number>, patch: Patch): Promise<boolean> => {
      const held = [...ids];
      const release = () => setInFlight((prev) => prev.filter((h) => h !== held));
      setInFlight((prev) => [...prev, held]);
      try {
        await send();
        const touched = new Set(ids);
        // One transition for both: released on its own lane, the eye was
        // clickable a render before the patch landed.
        startTransition(() => {
          setPanoramas((prev) => prev.map((p) => (touched.has(p.id) ? { ...p, ...patch } : p)));
          release();
        });
        onChanged();
        return true;
      } catch (err) {
        notify.error(messageOf(err));
        release();
        return false;
      }
    },
    [setPanoramas, onChanged],
  );

  const setHidden = useCallback(
    (ids: number[], hidden: boolean) => write(ids, () => setPanoramasHidden(slug, ids, hidden), { hidden }),
    [write, slug],
  );

  const moveToPhase = useCallback(
    (ids: number[], phase: PanoramaPhase) => write(ids, () => setPanoramasPhase(slug, ids, phase), { phase }),
    [write, slug],
  );

  const setPhaseHidden = useCallback(
    async (phase: PanoramaPhase, hidden: boolean): Promise<boolean> => {
      const release = () => setPendingPhases((prev) => prev.filter((p) => p !== phase));
      setPendingPhases((prev) => [...prev, phase]);
      try {
        const stored = await setPanoramaPhaseHidden(slug, phase, hidden);
        startTransition(() => {
          setPhaseHiddenState((prev) => ({ ...prev, [phase]: stored }));
          release();
        });
        onChanged();
        return true;
      } catch (err) {
        notify.error(messageOf(err));
        release();
        return false;
      }
    },
    [slug, onChanged],
  );

  return { pendingIds: inFlight.flat(), phaseHidden, pendingPhases, setHidden, moveToPhase, setPhaseHidden };
}
