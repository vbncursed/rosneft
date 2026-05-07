"use client";

import { useCallback, useMemo, useState } from "react";
import type { LodArtifact } from "@/shared/domain/lod-artifact";
import { useMeasurementTool } from "@/measurement/application/use-measurement-tool";
import { computeUnitRatio } from "@/measurement/domain/unit-ratio";
import { usePlacementsEditor } from "@/placement/application/use-placements-editor";
import PlacementsPanel from "@/placement/presentation/components/placements-panel";
import type { PlacementAssetOption } from "@/placement/domain/asset-option";
import type { ResolvedPlacement } from "@/placement/domain/placement";
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
}

export default function ModelViewer({
  parentLods,
  title,
  metadata,
  territorySlug,
  initialPlacements,
  modelOptions,
}: ModelViewerProps) {
  const editor = usePlacementsEditor(territorySlug, initialPlacements, modelOptions);
  const measure = useMeasurementTool();
  const [resetVersion, setResetVersion] = useState(0);

  const unitRatio = useMemo(
    () => computeUnitRatio(metadata.dimensions),
    [metadata],
  );

  // UIOverlay is memoed; passing a fresh `{ ...metadata, name: title }`
  // literal each render would defeat the shallow-equality skip. Build
  // it once per (metadata, title) change.
  const overlayMetadata = useMemo(
    () => ({ ...metadata, name: title }),
    [metadata, title],
  );

  const handleReset = useCallback(() => {
    setResetVersion((value) => value + 1);
  }, []);

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

  // Esc behaves layered: an open measurement chain is broken first, the
  // next press exits measure mode (and deselects any placement). This
  // matches the polyline UX — users can stop a chain without leaving
  // the tool, and a second tap fully exits.
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
        <PlacementsPanel
          placements={editor.placements}
          assets={modelOptions}
          mutation={editor.mutation}
          errorMessage={editor.errorMessage}
          selectedId={editor.selectedId}
          mode={editor.mode}
          onSelect={editor.setSelectedId}
          onModeChange={editor.setMode}
          onCreate={editor.create}
          onUpdate={editor.update}
          onDelete={editor.remove}
        />
      </div>
    </div>
  );
}
