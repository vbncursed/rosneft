import { useCallback, useState } from "react";
import type { usePlacementsEditor } from "@/features/placements-editor";
import type { useViewerMode } from "@/features/viewer-mode";

export type PlacementHandlerDeps = {
  mode: ReturnType<typeof useViewerMode>;
  editor: ReturnType<typeof usePlacementsEditor>;
  /** `usePageHandlers`' own: enters place mode and opens the picker. */
  openPicker: () => void;
};

/**
 * The Placements panel's hiding and group handlers, split out of
 * `usePageHandlers` at the 200-line cap. `placeGroupId` is where the picker's
 * next batch lands: `onPlace` reads it.
 */
export function usePlacementHandlers({ mode, editor, openPicker }: PlacementHandlerDeps) {
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
  // the scene no longer draws.
  const selectedId = mode.state.selectedId;
  const onSetHidden = useCallback(
    (ids: number[], hidden: boolean) => {
      if (hidden && selectedId !== null && ids.includes(selectedId)) mode.select(null);
      void editor.setHidden(ids, hidden);
    },
    [editor, mode, selectedId],
  );

  return { placeGroupId, onAdd, onAddToGroup, onSetHidden };
}
