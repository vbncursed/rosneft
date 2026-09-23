import { useCallback, useState, useTransition, type Dispatch, type SetStateAction } from "react";
import { setPlacementsGroup, setPlacementsHidden, type ResolvedPlacement } from "@/entities/placement";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";

export type BulkWritesParams = {
  slug: string;
  setPlacements: Dispatch<SetStateAction<ResolvedPlacement[]>>;
  onChanged: () => void;
};

type Patch = Partial<Pick<ResolvedPlacement, "hidden" | "groupId">>;

/**
 * The editor's writes over many placements at once — hide or show (G-3), move
 * to a group (G-4) — plus the local ungroup a deleted group leaves behind.
 * Split out of `usePlacementsEditor` at the 200-line cap. The gateway answers
 * only a count, so a success applies the patch it was sent.
 *
 * Their pending ids are their own, apart from the editor's single `mutation`:
 * sharing that slot let a finishing bulk write end a create still in flight,
 * and a finishing rename release a bulk write's rows. Each write holds its own
 * copy of the ids and drops exactly that copy, so two overlapping writes never
 * release each other's. Resolves to whether the write landed.
 */
export function useBulkWrites({ slug, setPlacements, onChanged }: BulkWritesParams) {
  const [inFlight, setInFlight] = useState<readonly number[][]>([]);
  const [, startTransition] = useTransition();

  const write = useCallback(
    async (ids: number[], send: () => Promise<number>, patch: Patch): Promise<boolean> => {
      const held = [...ids];
      const release = () => setInFlight((prev) => prev.filter((h) => h !== held));
      setInFlight((prev) => [...prev, held]);
      try {
        await send();
        const touched = new Set(ids);
        // One transition for both: released on its own (urgent) lane, the row
        // was clickable a render before the patch landed, and a click there
        // sent the value just written.
        startTransition(() => {
          setPlacements((prev) => prev.map((p) => (touched.has(p.id) ? { ...p, ...patch } : p)));
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
    [setPlacements, onChanged],
  );

  const setHidden = useCallback(
    (ids: number[], hidden: boolean) => write(ids, () => setPlacementsHidden(slug, ids, hidden), { hidden }),
    [write, slug],
  );

  const moveToGroup = useCallback(
    (ids: number[], groupId: number | null) =>
      write(ids, () => setPlacementsGroup(slug, ids, groupId), { groupId }),
    [write, slug],
  );

  // Mirrors ON DELETE SET NULL: the gateway already cleared the column.
  const ungroup = useCallback(
    (groupId: number) =>
      setPlacements((prev) => prev.map((p) => (p.groupId === groupId ? { ...p, groupId: null } : p))),
    [setPlacements],
  );

  return { pendingIds: inFlight.flat(), setHidden, moveToGroup, ungroup };
}
