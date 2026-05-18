import { memo, useEffect } from "react";
import LoadingProgress from "@/viewer/presentation/components/loading-progress";
import ModelInfoPanel from "@/viewer/presentation/components/model-info-panel";
import ResetCameraButton from "@/viewer/presentation/components/reset-camera-button";
import MeasureButton from "@/measurement/presentation/components/measure-button";
import type { ModelMetadata } from "@/viewer/domain/model-metadata";
import { notify } from "@/shared/presentation/toast/use-toast";

interface UIOverlayProps {
  progress: number;
  isLoaded: boolean;
  error: string | null;
  metadata: ModelMetadata | null;
  measureMode: boolean;
  pendingMeasurePoint: boolean;
  measurementCount: number;
  onReset: () => void;
  onToggleMeasure: () => void;
  onClearMeasurements: () => void;
}

// UIOverlay owns the left rail: ModelInfoPanel on top, the viewer toolbar
// (reset · measure · clear) and a tiny help bubble on the bottom. The
// right rail is owned by PlacementsPanel; this overlay deliberately leaves
// it untouched.
function UIOverlayImpl({
  progress,
  isLoaded,
  error,
  metadata,
  measureMode,
  pendingMeasurePoint,
  measurementCount,
  onReset,
  onToggleMeasure,
  onClearMeasurements,
}: UIOverlayProps) {
  useEffect(() => {
    if (error) notify.error(`Failed to load model: ${error}`);
  }, [error]);

  return (
    <div className="pointer-events-none absolute inset-0 flex select-none flex-col justify-between p-4 sm:p-6">
      <div className="pointer-events-auto flex justify-start">
        <ModelInfoPanel metadata={metadata} />
      </div>

      <div className="pointer-events-auto flex flex-col items-start gap-3">
        {!isLoaded && !error ? <LoadingProgress progress={progress} /> : null}

        <div className="flex flex-wrap items-center gap-2">
          <ResetCameraButton onReset={onReset} />
          <MeasureButton active={measureMode} onClick={onToggleMeasure} />
          {measurementCount > 0 ? (
            <button
              type="button"
              onClick={onClearMeasurements}
              className="cursor-pointer rounded-lg border border-white/15 bg-black/45 px-3 py-2 text-xs text-neutral-200 backdrop-blur transition-colors hover:bg-black/65"
            >
              Clear ({measurementCount})
            </button>
          ) : null}
          {measureMode ? (
            <p className="max-w-xs rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-3 py-2 text-[11px] leading-relaxed text-cyan-100 backdrop-blur">
              {pendingMeasurePoint
                ? "Click to extend · click the start dot to close the loop · × on a segment removes it · Shift+× removes the chain · Esc breaks the chain."
                : "Click the first point on the surface."}
            </p>
          ) : (
            <p className="hidden max-w-xs rounded-lg border border-white/20 bg-black/45 px-3 py-2 text-[11px] text-neutral-200 backdrop-blur sm:block">
              Drag: rotate · Wheel: zoom · Right click: pan · M: measure
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(UIOverlayImpl);
