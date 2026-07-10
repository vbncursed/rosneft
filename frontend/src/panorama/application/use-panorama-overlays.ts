"use client";

import { useCallback, useRef, useState } from "react";
import type { Panorama } from "@/panorama/domain/panorama";
import { usePanoramaCalibration } from "@/panorama/application/use-panorama-calibration";
import { usePanoramaOrchestration } from "@/panorama/application/use-panorama-orchestration";
import { usePanoramas } from "@/panorama/application/use-panoramas";
import type { Vec3 } from "@/shared/domain/vec3";
import { notify } from "@/shared/presentation/toast/use-toast";

// usePanoramaOverlays gathers every piece of panorama state the viewer needs:
// the CRUD list, the active/editing orchestration, calibration, the live camera
// mirror, marker visibility, and the broken-texture set. ModelViewer composes
// the scene; it should not also assemble the panorama context by hand.
export function usePanoramaOverlays(territorySlug: string, initial: Panorama[]) {
  const { panoramas, update, remove } = usePanoramas(territorySlug, initial);
  const orchestration = usePanoramaOrchestration(panoramas);
  const calibration = usePanoramaCalibration(orchestration.editingPanorama, update);

  // Ids whose equirect texture failed to decode (e.g. a non-image blob).
  // The in-Canvas error boundary reports them here so the edit panel can
  // flag the broken capture and nudge the operator to delete it.
  const [failedIds, setFailedIds] = useState<ReadonlySet<number>>(() => new Set());
  const onError = useCallback((id: number) => {
    setFailedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    notify.error(
      "Couldn't load this panorama image — it may not be a valid JPG/PNG. Delete it and upload an equirectangular image.",
    );
  }, []);

  // Mirror of the live R3F camera position — written each "change" by
  // CameraPositionTracker, read by the panorama edit panel.
  const cameraPositionRef = useRef<Vec3 | null>(null);

  // Show/hide the in-scene panorama markers (the clickable points in 3D).
  const [showMarkers, setShowMarkers] = useState(true);
  const toggleMarkers = useCallback(() => setShowMarkers((v) => !v), []);

  // Panorama "Move" mode commit = the same optimistic PUT the edit panel uses;
  // only position changes (title/yaw preserved by patch semantics).
  const onCommit = useCallback(
    (id: number, position: Vec3) => update(id, { position }),
    [update],
  );

  return {
    panoramas,
    update,
    remove,
    orchestration,
    calibration,
    failedIds,
    onError,
    cameraPositionRef,
    showMarkers,
    toggleMarkers,
    onCommit,
  };
}
