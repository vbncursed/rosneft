import { useCallback, useState } from "react";
import type { Vec3 } from "@/shared/domain/vec3";
import type { Panorama } from "@/panorama/domain/panorama";
import {
  applyCalibration,
  clampOpacity,
  nudgePosition,
  type CalibrationDraft,
} from "@/panorama/domain/calibration";

const DEFAULT_OPACITY = 0.5;

// Draft tagged with the panorama id it belongs to, so a draft never leaks
// onto a different panorama when the edit target changes.
type TaggedDraft = CalibrationDraft & { id: number };

// usePanoramaCalibration owns the overlay-calibration sub-mode for the
// panorama currently being edited. While calibrating, the sphere + camera
// render from an unsaved `draft` so adjustments are live; `save` persists
// the draft via the injected onSave. `effective` is the draft-overlaid
// panorama the scene should render (null when not calibrating).
//
// `calibrating` is DERIVED (draft tagged with the editing id) rather than a
// separate state synced by an effect — switching/closing the edit target
// turns calibration off automatically.
export function usePanoramaCalibration(
  editing: Panorama | null,
  onSave: (id: number, patch: { position: Vec3; yawOffset: number }) => void,
) {
  const [draft, setDraft] = useState<TaggedDraft | null>(null);
  const [opacity, setOpacityState] = useState(DEFAULT_OPACITY);

  const calibrating = draft != null && editing != null && draft.id === editing.id;

  const start = useCallback(() => {
    if (!editing) return;
    setDraft({
      id: editing.id,
      position: editing.position,
      yawOffset: editing.yawOffset,
    });
  }, [editing]);

  const cancel = useCallback(() => setDraft(null), []);

  const save = useCallback(() => {
    if (editing && draft && draft.id === editing.id) {
      onSave(editing.id, {
        position: draft.position,
        yawOffset: draft.yawOffset,
      });
    }
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
    editing && draft && draft.id === editing.id
      ? applyCalibration(editing, draft)
      : null;

  return {
    calibrating,
    draft: calibrating ? draft : null,
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
