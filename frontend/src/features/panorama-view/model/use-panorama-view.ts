import { useCallback, useMemo } from "react";
import type { Panorama } from "@/entities/panorama";
import type { ViewerView } from "@/features/viewer-mode";

/** The slice of the viewer mode this hook drives — the reducer owns the state. */
export type PanoramaViewMode = {
  view: ViewerView;
  editingPanoramaId: number | null;
  enterPanorama: (id: number) => void;
  exitPanorama: () => void;
  startEdit: (id: number) => void;
  closeEdit: () => void;
};

// usePanoramaView is the dual-state model that lets the operator calibrate one
// panorama while flipping back and forth between its sphere and the
// territory's 3D view:
//   • view — drives rendering. { kind: "scene" } = the territory.
//   • editingPanoramaId — the anchor card's target. Survives toggles between
//     3D and panorama views so the card stays open while the camera moves to
//     the real capture point.
//
// Both live in the viewer-mode reducer, so Escape and the keys peel the same
// layers this hook pushes. `panoramas` is the live list from usePanoramaList —
// when it changes (CRUD, optimistic edits), `active` and `editing` recompute
// by id lookup.
export function usePanoramaView(panoramas: Panorama[], mode: PanoramaViewMode) {
  const { view, editingPanoramaId, enterPanorama, exitPanorama, startEdit, closeEdit } = mode;
  const activeId = view.kind === "panorama" ? view.id : null;

  const active = useMemo(
    () => panoramas.find((p) => p.id === activeId) ?? null,
    [panoramas, activeId],
  );
  const editing = useMemo(
    () => panoramas.find((p) => p.id === editingPanoramaId) ?? null,
    [panoramas, editingPanoramaId],
  );

  // The picker enters panorama view AND opens the card for it. Going back to
  // "3D scene" via the picker keeps the previous edit target open (the X in
  // the card clears it).
  const activate = useCallback(
    (id: number | null) => {
      if (id === null) {
        exitPanorama();
        return;
      }
      enterPanorama(id);
      startEdit(id);
    },
    [enterPanorama, exitPanorama, startEdit],
  );

  // Toggle between "in the editing panorama" and "3D view of the same
  // territory" without losing the edit target — the operator needs the 3D view
  // to position the camera at the real capture point before hitting "Set from
  // camera".
  const toggleView = useCallback(() => {
    if (editingPanoramaId === null) return;
    if (activeId === null) enterPanorama(editingPanoramaId);
    else exitPanorama();
  }, [activeId, editingPanoramaId, enterPanorama, exitPanorama]);

  // P cycles "3D → first panorama → next → … → 3D" so a reader can sweep
  // through capture points without reaching for the picker. No-op when the
  // territory has no panoramas anchored.
  const cycle = useCallback(() => {
    if (panoramas.length === 0) return;
    if (activeId === null) {
      enterPanorama(panoramas[0].id);
      return;
    }
    // A capture deleted under the reader has no successor: the scene is the
    // only honest next step.
    const next = panoramas.findIndex((p) => p.id === activeId) + 1;
    if (next === 0 || next >= panoramas.length) exitPanorama();
    else enterPanorama(panoramas[next].id);
  }, [panoramas, activeId, enterPanorama, exitPanorama]);

  const index = useMemo(
    () => ({
      current: editingPanoramaId === null
        ? 0
        : panoramas.findIndex((p) => p.id === editingPanoramaId) + 1,
      total: panoramas.length,
    }),
    [panoramas, editingPanoramaId],
  );

  return { active, editing, activate, cycle, toggleView, startEdit, closeEdit, index };
}
