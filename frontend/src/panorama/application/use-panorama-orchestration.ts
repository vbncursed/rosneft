"use client";

import { useCallback, useMemo, useState } from "react";
import type { Panorama } from "@/panorama/domain/panorama";

// usePanoramaOrchestration owns the dual-state model that lets the
// operator calibrate one panorama while flipping back and forth between
// its sphere and the territory's 3D view:
//   • activePanoramaId — drives rendering. null = territory 3D scene.
//   • editingPanoramaId — calibration target. Survives toggles between
//     3D and panorama views so the edit panel stays open while the
//     camera moves to the real capture point.
//
// `panoramas` is expected to be the live list from usePanoramas — when
// it changes (CRUD, optimistic edits), the derived `activePanorama` and
// `editingPanorama` recompute by id lookup.
export function usePanoramaOrchestration(panoramas: Panorama[]) {
  const [activePanoramaId, setActivePanoramaId] = useState<number | null>(null);
  const [editingPanoramaId, setEditingPanoramaId] = useState<number | null>(null);

  const activePanorama = useMemo(
    () => panoramas.find((p) => p.id === activePanoramaId) ?? null,
    [panoramas, activePanoramaId],
  );
  const editingPanorama = useMemo(
    () => panoramas.find((p) => p.id === editingPanoramaId) ?? null,
    [panoramas, editingPanoramaId],
  );

  // Picker activates panorama view AND opens the edit panel for it.
  // Going back to "3D scene" via the picker keeps the previous edit
  // target open (the X button in the panel clears it).
  const activate = useCallback((id: number | null) => {
    setActivePanoramaId(id);
    if (id !== null) setEditingPanoramaId(id);
  }, []);

  // Toggle between "in the editing panorama" and "3D view of the same
  // territory" without losing the edit target — the operator needs the
  // 3D view to position the camera at the real capture point before
  // hitting "Set from camera".
  const toggleView = useCallback(() => {
    if (editingPanoramaId == null) return;
    setActivePanoramaId((prev) => (prev === null ? editingPanoramaId : null));
  }, [editingPanoramaId]);

  const closeEdit = useCallback(() => setEditingPanoramaId(null), []);

  // P cycles through "3D → first panorama → next → ... → 3D" so a user
  // can sweep through capture points without reaching for the picker.
  // No-op when the territory has no panoramas anchored.
  const cycle = useCallback(() => {
    if (panoramas.length === 0) return;
    setActivePanoramaId((current) => {
      if (current === null) return panoramas[0].id;
      const idx = panoramas.findIndex((p) => p.id === current);
      const next = idx + 1;
      return next >= panoramas.length ? null : panoramas[next].id;
    });
  }, [panoramas]);

  return {
    activePanoramaId,
    editingPanoramaId,
    activePanorama,
    editingPanorama,
    activate,
    toggleView,
    closeEdit,
    cycle,
  };
}
