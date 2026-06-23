import { useCallback, useEffect, useState } from "react";
import type { Vec3 } from "@/shared/domain/vec3";
import type { Panorama } from "@/panorama/domain/panorama";
import {
  applyCalibration,
  clampOpacity,
  nudgePosition,
  type CalibrationDraft,
} from "@/panorama/domain/calibration";

const DEFAULT_OPACITY = 0.5;

// usePanoramaCalibration owns the overlay-calibration sub-mode for the
// panorama currently being edited. While calibrating, the sphere + camera
// render from an unsaved `draft` so adjustments are live; `save` persists
// the draft via the injected onSave. `effective` is the draft-overlaid
// panorama the scene should render (null when not calibrating).
export function usePanoramaCalibration(
  editing: Panorama | null,
  onSave: (id: number, patch: { position: Vec3; yawOffset: number }) => void,
) {
  const [calibrating, setCalibrating] = useState(false);
  const [draft, setDraft] = useState<CalibrationDraft | null>(null);
  const [opacity, setOpacityState] = useState(DEFAULT_OPACITY);

  // Calibration belongs to one panorama; switching the edit target (or
  // closing it) cancels an in-progress calibration so a stale draft never
  // applies to a different panorama.
  const editingId = editing?.id ?? null;
  useEffect(() => {
    setCalibrating(false);
    setDraft(null);
  }, [editingId]);

  const start = useCallback(() => {
    if (!editing) return;
    setDraft({ position: editing.position, yawOffset: editing.yawOffset });
    setCalibrating(true);
  }, [editing]);

  const cancel = useCallback(() => {
    setCalibrating(false);
    setDraft(null);
  }, []);

  const save = useCallback(() => {
    if (editing && draft) {
      onSave(editing.id, {
        position: draft.position,
        yawOffset: draft.yawOffset,
      });
    }
    setCalibrating(false);
    setDraft(null);
  }, [editing, draft, onSave]);

  const nudge = useCallback((axis: "x" | "y" | "z", delta: number) => {
    setDraft((d) =>
      d ? { ...d, position: nudgePosition(d.position, axis, delta) } : d,
    );
  }, []);

  const setYaw = useCallback((yawOffset: number) => {
    setDraft((d) => (d ? { ...d, yawOffset } : d));
  }, []);

  const setPosition = useCallback((position: Vec3) => {
    setDraft((d) => (d ? { ...d, position } : d));
  }, []);

  const setOpacity = useCallback(
    (o: number) => setOpacityState(clampOpacity(o)),
    [],
  );

  const effective =
    calibrating && editing && draft ? applyCalibration(editing, draft) : null;

  return {
    calibrating,
    draft,
    opacity,
    effective,
    start,
    cancel,
    save,
    nudge,
    setYaw,
    setPosition,
    setOpacity,
  };
}
