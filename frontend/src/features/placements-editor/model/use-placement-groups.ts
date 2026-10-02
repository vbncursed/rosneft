import { useCallback, useState } from "react";
import {
  createPlacementGroup,
  deletePlacementGroup,
  renamePlacementGroup,
  setPlacementGroupHidden,
  type PlacementGroup,
} from "@/entities/placement";
import { messageOf } from "@/shared/api";
import { notify } from "@/shared/lib/notify";

export type PlacementGroupsParams = {
  slug: string;
  /** The bundle's groups, seeded once — like every list on the viewer. */
  initial: PlacementGroup[];
  /** Every settled write calls this; the page marks the scene bundle stale. */
  onChanged: () => void;
  /** A group is gone: its placements drop back to No group (the editor's `ungroup`). */
  onRemoved: (groupId: number) => void;
};

/**
 * The territory's user groups (G-2): create, rename, delete. One write at a
 * time (`busy`); each applies the server's answer and resolves to whether it
 * landed — the title field stays open, text and all, on a refusal. Deleting
 * never deletes placements (G-4) — `onRemoved` lets the editor clear their
 * `groupId` locally.
 */
export function usePlacementGroups({ slug, initial, onChanged, onRemoved }: PlacementGroupsParams) {
  const [list, setList] = useState<PlacementGroup[]>(initial);
  const [busy, setBusy] = useState(false);

  // Both ways, like the other lists here: a refusal may mean the row changed
  // under us, and only a re-read of the bundle can say.
  const run = useCallback(
    async (write: () => Promise<void>): Promise<boolean> => {
      setBusy(true);
      try {
        await write();
        return true;
      } catch (err) {
        notify.error(messageOf(err));
        return false;
      } finally {
        onChanged();
        setBusy(false);
      }
    },
    // oxlint-disable-next-line react/memo-dependencies -- false positive: onChanged is called in the finally block, and react-hooks/exhaustive-deps requires it; dropping it would capture a stale callback
    [onChanged],
  );

  const create = useCallback(
    (title: string) =>
      run(async () => {
        const group = await createPlacementGroup(slug, title);
        setList((prev) => [...prev, group]);
      }),
    [run, slug],
  );

  const rename = useCallback(
    (id: number, title: string) =>
      run(async () => {
        const group = await renamePlacementGroup(slug, id, title);
        setList((prev) => prev.map((g) => (g.id === id ? group : g)));
      }),
    [run, slug],
  );

  const remove = useCallback(
    (id: number) =>
      run(async () => {
        await deletePlacementGroup(slug, id);
        setList((prev) => prev.filter((g) => g.id !== id));
        onRemoved(id);
      }),
    [run, slug, onRemoved],
  );

  // The group's own flag (D5, D6): its members keep theirs, so the editor's
  // list does not change — the scene reads the flag off this list.
  const setHidden = useCallback(
    (id: number, hidden: boolean) =>
      run(async () => {
        const group = await setPlacementGroupHidden(slug, id, hidden);
        setList((prev) => prev.map((g) => (g.id === id ? group : g)));
      }),
    [run, slug],
  );

  return { list, busy, create, rename, remove, setHidden };
}
