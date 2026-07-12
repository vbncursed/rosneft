"use client";

import { useCallback, useMemo, useState } from "react";
import type { LodArtifact } from "@/shared/domain/lod-artifact";
import { useCan, useCurrentUser } from "@/auth/presentation/current-user-context";
import { useTour } from "@/onboarding/application/use-tour";
import { PANORAMA_TOUR, VIEWER_TOUR } from "@/onboarding/domain/tour-id";
import { PANORAMA_TOUR_STEPS } from "@/onboarding/domain/panorama-tour-steps";
import { VIEWER_TOUR_STEPS } from "@/onboarding/domain/viewer-tour-steps";
import TourOverlay from "@/onboarding/presentation/tour-overlay";
import { useOverlaysPanel } from "@/viewer/application/use-overlays-panel";
import { useMeasurementTool } from "@/measurement/application/use-measurement-tool";
import { computeUnitRatio } from "@/measurement/domain/unit-ratio";
import { usePlacementsEditor } from "@/placement/application/use-placements-editor";
import PlacementsSection from "@/placement/presentation/components/placements-section";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import type { ResolvedPlacement } from "@/placement/domain/placement";
import type { Panorama } from "@/panorama/domain/panorama";
import PanoramaSection from "@/panorama/presentation/components/panorama-section";
import { usePanoramaOverlays } from "@/panorama/application/use-panorama-overlays";
import type { Document } from "@/document/domain/document";
import { useDocumentSelection } from "@/document/application/use-document-selection";
import DocumentView from "@/document/presentation/components/document-view";
import OverlaysPanel from "@/viewer/presentation/components/overlays-panel";
import { useViewerModeShortcuts } from "@/viewer/application/use-viewer-mode-shortcuts";
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
  const pano = usePanoramaOverlays(territorySlug, initialPanoramas);

  const dim = metadata.dimensions;
  const territoryMaxDim = useMemo(() => Math.max(dim.x, dim.y, dim.z), [dim]);
  const editor = usePlacementsEditor(territorySlug, initialPlacements, modelOptions, territoryMaxDim);
  const leavePanorama = useCallback(() => pano.orchestration.activate(null), [pano.orchestration]);
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

  // Two first-run tours: the viewer on arrival, the panorama one the first time
  // the user stands inside a panorama (its panel does not exist until then).
  // They reveal a control before spotlighting it, which is why the overlays
  // panel's tab/collapse state is lifted out of the panel.
  const seenTours = useCurrentUser()?.onboardingToursSeen ?? [];
  const inPanorama = pano.orchestration.activePanorama != null;
  const viewerTour = useTour(VIEWER_TOUR, VIEWER_TOUR_STEPS, { seen: seenTours.includes(VIEWER_TOUR), ready: true });
  const panoramaTour = useTour(PANORAMA_TOUR, PANORAMA_TOUR_STEPS, {
    seen: seenTours.includes(PANORAMA_TOUR),
    ready: inPanorama && !viewerTour.active,
  });
  const tour = viewerTour.active ? viewerTour : panoramaTour;
  const panel = useOverlaysPanel(editor.selectedId, tour.step?.tab, tour.active);

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

  // Scene interaction modes (gizmo / measure / panorama Move), their mutual
  // exclusion, and keyboard bindings live in one hook so this component stays
  // compositional. panoramaDrag drives the in-scene marker drag.
  const { handleToggleMeasure, handleToggleMove, panoramaDrag } =
    useViewerModeShortcuts({
      setSelectedId: editor.setSelectedId,
      setMode: editor.setMode,
      measureMode: measure.measureMode,
      activeChainId: measure.activeChainId,
      toggleMeasure: measure.toggle,
      exitMeasure: measure.exit,
      cancelChain: measure.cancelChain,
      toggleSnap,
      cyclePanorama: pano.orchestration.cycle,
      onCommitPanorama: pano.onCommit,
    });

  return (
    // A document opens in a floating PiP window (scene stays live so objects
    // can be placed against the PDF). Only its full-screen mode hides the 3D
    // canvas, to spare the GPU. State is preserved, so toggling is instant.
    <div className={`relative h-full w-full touch-none ${docSel.active && docSel.fullscreen ? "hidden" : ""}`}>
      <SceneCanvas
        parentLods={parentLods}
        resetVersion={resetVersion}
        placements={editor.placements}
        selectedId={editor.selectedId}
        mode={editor.mode}
        measureMode={measure.measureMode}
        snapEnabled={snapEnabled}
        canEditPlacements={canEditPlacements}
        activePanorama={pano.calibration.effective ?? pano.orchestration.activePanorama}
        panoramas={pano.panoramas}
        onActivatePanorama={pano.orchestration.activate}
        panoramaMove={panoramaDrag}
        showMarkers={pano.showMarkers}
        calibrating={pano.calibration.calibrating}
        panoramaOpacity={pano.calibration.opacity}
        cameraPositionRef={pano.cameraPositionRef}
        cameraYawRef={pano.cameraYawRef}
        onPanoramaError={pano.onError}
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
        onRestartTour={inPanorama ? panoramaTour.restart : viewerTour.restart}
      />

      <TourOverlay tour={tour} />

      {docSel.active ? (
        <DocumentView
          document={docSel.active}
          canDelete={canDeleteDoc}
          fullscreen={docSel.fullscreen}
          onToggleFullscreen={docSel.toggleFullscreen}
          onDelete={docSel.removeActive}
          onClose={docSel.clear}
        />
      ) : null}

      {/* top-16 (not top-4): clears the global UserMenu avatar fixed at right-4 top-4 */}
      <div className="pointer-events-none absolute top-16 right-4 bottom-4 flex flex-col items-end gap-3">
        <OverlaysPanel
          placementsCount={editor.placements.length}
          tab={panel.tab}
          onTabChange={panel.setTab}
          collapsed={panel.collapsed}
          onCollapsedChange={panel.setCollapsed}
          view={
            <PanoramaSection
              territorySlug={territorySlug}
              panorama={pano.orchestration}
              panoramas={pano.panoramas}
              documents={docSel.documents}
              activeDocumentId={docSel.activeId}
              onActivatePanorama={(id) => {
                docSel.clear();
                pano.orchestration.activate(id);
              }}
              onActivateDocument={docSel.select}
              cameraPositionRef={pano.cameraPositionRef}
              cameraYawRef={pano.cameraYawRef}
              externalPanoramaUrl={externalPanoramaUrl}
              failedPanoramaIds={pano.failedIds}
              calibration={pano.calibration}
              markersVisible={pano.showMarkers}
              onToggleMarkers={pano.toggleMarkers}
              moveMode={panoramaDrag.moveMode}
              onToggleMove={handleToggleMove}
              onSavePanorama={pano.update}
              onDeletePanorama={pano.remove}
            />
          }
          placements={
            <PlacementsSection
              editor={editor}
              assets={modelOptions}
              activePanoramaId={pano.orchestration.activePanorama?.id ?? null}
              snapEnabled={snapEnabled}
              onToggleSnap={toggleSnap}
            />
          }
        />
      </div>
    </div>
  );
}
