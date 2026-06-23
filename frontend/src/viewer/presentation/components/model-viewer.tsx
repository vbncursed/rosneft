"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { LodArtifact } from "@/shared/domain/lod-artifact";
import { useMeasurementTool } from "@/measurement/application/use-measurement-tool";
import { computeUnitRatio } from "@/measurement/domain/unit-ratio";
import { usePlacementsEditor } from "@/placement/application/use-placements-editor";
import PlacementsSection from "@/placement/presentation/components/placements-section";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import type { ResolvedPlacement } from "@/placement/domain/placement";
import type { Panorama } from "@/panorama/domain/panorama";
import PanoramaSection from "@/panorama/presentation/components/panorama-section";
import OverlaysPanel from "@/viewer/presentation/components/overlays-panel";
import { usePanoramaOrchestration } from "@/panorama/application/use-panorama-orchestration";
import { usePanoramaCalibration } from "@/panorama/application/use-panorama-calibration";
import { usePanoramas } from "@/panorama/application/use-panoramas";
import type { Vec3 } from "@/shared/domain/vec3";
import { notify } from "@/shared/presentation/toast/use-toast";
import { useKeyboardShortcuts } from "@/viewer/application/use-keyboard-shortcuts";
import type { ModelMetadata } from "@/viewer/domain/model-metadata";
import SceneCanvas from "@/viewer/presentation/three/scene-canvas";
import UIOverlay from "@/viewer/presentation/components/ui-overlay";

export interface ModelViewerProps {
  parentLods: LodArtifact[];
  title: string;
  metadata: ModelMetadata;
  territorySlug: string;
  initialPlacements: ResolvedPlacement[];
  modelOptions: PlacementAssetOption[];
  panoramas: Panorama[];
  externalPanoramaUrl?: string;
}

export default function ModelViewer({
  parentLods,
  title,
  metadata,
  territorySlug,
  initialPlacements,
  modelOptions,
  panoramas: initialPanoramas,
  externalPanoramaUrl,
}: ModelViewerProps) {
  const {
    panoramas,
    update: updatePanoramaState,
    remove: removePanorama,
  } = usePanoramas(territorySlug, initialPanoramas);
  const panorama = usePanoramaOrchestration(panoramas);
  const calibration = usePanoramaCalibration(
    panorama.editingPanorama,
    updatePanoramaState,
  );
  // Ids whose equirect texture failed to decode (e.g. a non-image blob).
  // The in-Canvas error boundary reports them here so the edit panel can
  // flag the broken capture and nudge the operator to delete it.
  const [failedPanoramaIds, setFailedPanoramaIds] = useState<
    ReadonlySet<number>
  >(() => new Set());
  const handlePanoramaError = useCallback((id: number) => {
    setFailedPanoramaIds((prev) =>
      prev.has(id) ? prev : new Set(prev).add(id),
    );
    notify.error(
      "Couldn't load this panorama image — it may not be a valid JPG/PNG. Delete it and upload an equirectangular image.",
    );
  }, []);
  // Mirror of the live R3F camera position — written each "change" by
  // CameraPositionTracker, read by the panorama edit panel.
  const cameraPositionRef = useRef<Vec3 | null>(null);

  const territoryMaxDim = useMemo(
    () => Math.max(metadata.dimensions.x, metadata.dimensions.y, metadata.dimensions.z),
    [metadata.dimensions],
  );
  const editor = usePlacementsEditor(
    territorySlug,
    initialPlacements,
    modelOptions,
    territoryMaxDim,
  );
  const measure = useMeasurementTool();
  const [resetVersion, setResetVersion] = useState(0);
  // Surface magnetism: when true, the translate gizmo glues the placement
  // to the territory Y under it. When false, the same raycast acts as a
  // floor so dragged objects can hover but never bury into the terrain.
  const [snapEnabled, setSnapEnabled] = useState(false);
  const toggleSnap = useCallback(() => setSnapEnabled((v) => !v), []);

  const unitRatio = useMemo(
    () => computeUnitRatio(metadata.dimensions),
    [metadata],
  );

  // UIOverlay is memoed; passing a fresh `{ ...metadata, name: title }`
  // literal each render would defeat the shallow-equality skip.
  const overlayMetadata = useMemo(
    () => ({ ...metadata, name: title }),
    [metadata, title],
  );

  const handleReset = useCallback(
    () => setResetVersion((value) => value + 1),
    [],
  );

  // Total visible segments across all chains — feeds the Clear (N) badge
  // and lets the overlay know whether anything is currently drawn.
  const segmentCount = useMemo(() => {
    let total = 0;
    for (const chain of measure.chains) {
      total += chain.closed ? chain.points.length : chain.points.length - 1;
    }
    return total;
  }, [measure.chains]);

  // Entering measure mode drops the gizmo target so a stray drag can't
  // move a placement while the user is just picking a point.
  const handleToggleMeasure = useCallback(() => {
    if (!measure.measureMode) editor.setSelectedId(null);
    measure.toggle();
  }, [editor, measure]);

  // Esc behaves layered: an open chain breaks first, the next press
  // exits measure mode (and deselects any placement).
  const handleEscape = useCallback(() => {
    if (measure.measureMode && measure.activeChainId != null) {
      measure.cancelChain();
      return;
    }
    editor.setSelectedId(null);
    measure.exit();
  }, [editor, measure]);

  useKeyboardShortcuts({
    Escape: handleEscape,
    m: handleToggleMeasure,
    t: () => editor.setMode("translate"),
    r: () => editor.setMode("rotate"),
    s: () => editor.setMode("scale"),
    g: toggleSnap,
    p: panorama.cycle,
  });

  return (
    <div className="relative h-full w-full touch-none">
      <SceneCanvas
        parentLods={parentLods}
        resetVersion={resetVersion}
        placements={editor.placements}
        selectedId={editor.selectedId}
        mode={editor.mode}
        measureMode={measure.measureMode}
        snapEnabled={snapEnabled}
        activePanorama={calibration.effective ?? panorama.activePanorama}
        panoramas={panoramas}
        onActivatePanorama={panorama.activate}
        calibrating={calibration.calibrating}
        panoramaOpacity={calibration.opacity}
        cameraPositionRef={cameraPositionRef}
        onPanoramaError={handlePanoramaError}
        chains={measure.chains}
        activeChainId={measure.activeChainId}
        unitRatio={unitRatio}
        onSelect={editor.setSelectedId}
        onCommit={editor.commitTransform}
        onMeasureClick={measure.click}
        onCloseActiveChain={measure.closeActive}
        onRemoveSegment={measure.removeSegment}
        onRemoveChain={measure.removeChain}
      />

      <UIOverlay
        progress={100}
        isLoaded
        error={null}
        metadata={overlayMetadata}
        measureMode={measure.measureMode}
        pendingMeasurePoint={measure.activeChainId != null}
        measurementCount={segmentCount}
        onReset={handleReset}
        onToggleMeasure={handleToggleMeasure}
        onClearMeasurements={measure.clear}
      />

      <div className="pointer-events-none absolute top-4 right-4 bottom-4 flex flex-col items-end gap-3">
        <OverlaysPanel
          placementsCount={editor.placements.length}
          selectedPlacementId={editor.selectedId}
          view={
            <PanoramaSection
              territorySlug={territorySlug}
              panorama={panorama}
              panoramas={panoramas}
              cameraPositionRef={cameraPositionRef}
              externalPanoramaUrl={externalPanoramaUrl}
              failedPanoramaIds={failedPanoramaIds}
              calibration={calibration}
              onSavePanorama={updatePanoramaState}
              onDeletePanorama={removePanorama}
            />
          }
          placements={
            <PlacementsSection
              editor={editor}
              assets={modelOptions}
              snapEnabled={snapEnabled}
              onToggleSnap={toggleSnap}
            />
          }
        />
      </div>
    </div>
  );
}
