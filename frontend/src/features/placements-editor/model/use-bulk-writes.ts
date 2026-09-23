import { useCallback, useTransition, type Dispatch, type SetStateAction } from "react";
import {
  bulk,
  idle,
  setPlacementsGroup,
  setPlacementsHidden,
  type MutationState,
  type ResolvedPlacement,
} from "@/entities/placement";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";

export type BulkWritesParams = {
  slug: string;
  setPlacements: Dispatch<SetStateAction<ResolvedPlacement[]>>;
  setMutation: Dispatch<SetStateAction<MutationState>>;
  onChanged: () => void;
};

type Patch = Partial<Pick<ResolvedPlacement, "hidden" | "groupId">>;

/**
 * The editor's writes over many placements at once — hide or show (G-3), move
 * to a group (G-4) — plus the local ungroup a deleted group leaves behind.
 * Split out of `usePlacementsEditor` at the 200-line cap. The gateway answers
 * only a count, so a success applies the patch it was sent.
 */
export function useBulkWrites({ slug, setPlacements, setMutation, onChanged }: BulkWritesParams) {
  const [, startTransition] = useTransition();

  const write = useCallback(
    async (ids: number[], send: () => Promise<number>, patch: Patch) => {
      setMutation(bulk(ids));
      try {
        await send();
        const touched = new Set(ids);
        // One transition for both: released on its own (urgent) lane, the row
        // was clickable a render before the patch landed, and a click there
        // sent the value just written.
        startTransition(() => {
          setPlacements((prev) => prev.map((p) => (touched.has(p.id) ? { ...p, ...patch } : p)));
          setMutation(idle);
        });
        onChanged();
      } catch (err) {
        notify.error(messageOf(err));
        setMutation(idle);
      }
    },
    [setPlacements, setMutation, onChanged],
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

  return { setHidden, moveToGroup, ungroup };
}
