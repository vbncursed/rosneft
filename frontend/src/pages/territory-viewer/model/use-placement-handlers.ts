import { useCallback, useEffect, useRef, useState } from "react";
import type { PlacementGroup } from "@/entities/placement";
import type { usePlacementsEditor } from "@/features/placements-editor";
import type { useViewerMode } from "@/features/viewer-mode";

export type PlacementHandlerDeps = {
  mode: ReturnType<typeof useViewerMode>;
  editor: ReturnType<typeof usePlacementsEditor>;
  /** The group's own flag (D6); resolves true once the server stored it. */
  setGroupHidden: (id: number, hidden: boolean) => Promise<boolean>;
  /** So a landed move into a hidden group can be judged against it (§1.7). */
  groups: readonly PlacementGroup[];
  /** `usePageHandlers`' own: enters place mode and opens the picker. */
  openPicker: () => void;
};

/**
 * The Placements panel's hiding and group handlers, split out of
 * `usePageHandlers` at the 200-line cap. `placeGroupId` is where the picker's
 * next batch lands: `onPlace` reads it.
 */
export function usePlacementHandlers({ mode, editor, setGroupHidden, groups, openPicker }: PlacementHandlerDeps) {
  const [placeGroupId, setPlaceGroupId] = useState<number | null>(null);

  // Two ways into one picker: the rail/panel Add places in No group, a user
  // group's own Add places into that group (G-4).
  const onAdd = useCallback(() => {
    setPlaceGroupId(null);
    openPicker();
  }, [openPicker]);
  const onAddToGroup = useCallback(
    (groupId: number) => {
      setPlaceGroupId(groupId);
      openPicker();
    },
    [openPicker],
  );

  // §1.7: nothing hidden may stay selected — the gizmo would hold an object
  // the scene no longer draws. Only once the hide has landed: a refused one
  // leaves the object drawn, and its selection with it. Read through a ref,
  // so a selection made while the write was in flight is judged, not the
  // one the click saw.
  const selectedId = useRef(mode.state.selectedId);
  useEffect(() => {
    selectedId.current = mode.state.selectedId;
  }, [mode.state.selectedId]);
  const { select } = mode;
  const onSetHidden = useCallback(
    async (ids: number[], hidden: boolean) => {
      const landed = await editor.setHidden(ids, hidden);
      const current = selectedId.current;
      if (landed && hidden && current !== null && ids.includes(current)) select(null);
    },
    [editor, select],
  );

  // §1.7 for a group: a selected member leaves the scene with its group, so
  // it leaves the selection too — once the flag has landed, judged against
  // the selection at that moment.
  const placementsRef = useRef(editor.placements);
  useEffect(() => {
    placementsRef.current = editor.placements;
  }, [editor.placements]);
  const onSetGroupHidden = useCallback(
    async (groupId: number, hidden: boolean) => {
      const landed = await setGroupHidden(groupId, hidden);
      const current = selectedId.current;
      if (!landed || !hidden || current === null) return;
      if (placementsRef.current.find((p) => p.id === current)?.groupId === groupId) select(null);
    },
    [setGroupHidden, select],
  );

  // §1.7 for Move to...: landing in a hidden group takes the object off the
  // scene exactly like a hide does, so a selection among the moved ids leaves
  // too — a move to "no group", a shown group or a refused move draws no one
  // off the scene, and the selection stays.
  const groupsRef = useRef(groups);
  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);
  const onMoveToGroup = useCallback(
    async (ids: number[], groupId: number | null) => {
      const landed = await editor.moveToGroup(ids, groupId);
      const current = selectedId.current;
      if (!landed || groupId === null || current === null || !ids.includes(current)) return;
      if (groupsRef.current.find((g) => g.id === groupId)?.hidden) select(null);
    },
    [editor, select],
  );

  return { placeGroupId, onAdd, onAddToGroup, onSetHidden, onSetGroupHidden, onMoveToGroup };
}
