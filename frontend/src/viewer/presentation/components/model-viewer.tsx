"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { LodArtifact } from "@/shared/domain/lod-artifact";
import { useCan } from "@/auth/presentation/current-user-context";
import { useMeasurementTool } from "@/measurement/application/use-measurement-tool";
import { computeUnitRatio } from "@/measurement/domain/unit-ratio";
import { usePlacementsEditor } from "@/placement/application/use-placements-editor";
import PlacementsSection from "@/placement/presentation/components/placements-section";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import type { ResolvedPlacement } from "@/placement/domain/placement";
import type { Panorama } from "@/panorama/domain/panorama";
import PanoramaSection from "@/panorama/presentation/components/panorama-section";
import type { Document } from "@/document/domain/document";
import { useDocumentSelection } from "@/document/application/use-document-selection";
import DocumentView from "@/document/presentation/components/document-view";
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
  documents: Document[];
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
  documents,
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
  const [failedPanoramaIds, setFailedPanoramaIds] = useState<ReadonlySet<number>>(() => new Set());
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

  const dim = metadata.dimensions;
  const territoryMaxDim = useMemo(() => Math.max(dim.x, dim.y, dim.z), [dim]);
  const editor = usePlacementsEditor(territorySlug, initialPlacements, modelOptions, territoryMaxDim);
  const leavePanorama = useCallback(() => panorama.activate(null), [panorama]);
  const docSel = useDocumentSelection(territorySlug, documents, leavePanorama);
  const canDeleteDoc = useCan()("document:delete");
  const measure = useMeasurementTool();
  // Read once here, outside the R3F Canvas — React context doesn't cross the
  // Canvas reconciler boundary, so the gizmo gate must arrive as a prop.
  const canEditPlacements = useCan()("placement:write");
  const [resetVersion, setResetVersion] = useState(0);
  // Surface magnetism: when true, the translate gizmo glues the placement
  // to the territory Y under it. When false, the same raycast acts as a
  // floor so dragged objects can hover but never bury into the terrain.
  const [snapEnabled, setSnapEnabled] = useState(false);
  const toggleSnap = useCallback(() => setSnapEnabled((v) => !v), []);
  // Show/hide the in-scene panorama markers (the clickable points in 3D).
  const [showMarkers, setShowMarkers] = useState(true);
  const toggleMarkers = useCallback(() => setShowMarkers((v) => !v), []);

  const unitRatio = useMemo(() => computeUnitRatio(dim), [dim]);

  // UIOverlay is memoed; passing a fresh `{ ...metadata, name: title }`
  // literal each render would defeat the shallow-equality skip.
  const overlayMetadata = useMemo(() => ({ ...metadata, name: title }), [metadata, title]);

  const handleReset = useCallback(() => setResetVersion((value) => value + 1), []);

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
        canEditPlacements={canEditPlacements}
        activePanorama={calibration.effective ?? panorama.activePanorama}
        panoramas={panoramas}
        onActivatePanorama={panorama.activate}
        showMarkers={showMarkers}
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

      {docSel.active ? (
        <DocumentView
          document={docSel.active}
          canDelete={canDeleteDoc}
          onDelete={docSel.removeActive}
        />
      ) : null}

      {/* top-16 (not top-4): clears the global UserMenu avatar fixed at right-4 top-4 */}
      <div className="pointer-events-none absolute top-16 right-4 bottom-4 flex flex-col items-end gap-3">
        <OverlaysPanel
          placementsCount={editor.placements.length}
          selectedPlacementId={editor.selectedId}
          view={
            <PanoramaSection
              territorySlug={territorySlug}
              panorama={panorama}
              panoramas={panoramas}
              documents={docSel.documents}
              activeDocumentId={docSel.activeId}
              onActivatePanorama={(id) => {
                docSel.clear();
                panorama.activate(id);
              }}
              onActivateDocument={docSel.select}
              cameraPositionRef={cameraPositionRef}
              externalPanoramaUrl={externalPanoramaUrl}
              failedPanoramaIds={failedPanoramaIds}
              calibration={calibration}
              markersVisible={showMarkers}
              onToggleMarkers={toggleMarkers}
              onSavePanorama={updatePanoramaState}
              onDeletePanorama={removePanorama}
            />
          }
          placements={
            <PlacementsSection
              editor={editor}
              assets={modelOptions}
              activePanoramaId={panorama.activePanorama?.id ?? null}
              snapEnabled={snapEnabled}
              onToggleSnap={toggleSnap}
            />
          }
        />
      </div>
    </div>
  );
}
