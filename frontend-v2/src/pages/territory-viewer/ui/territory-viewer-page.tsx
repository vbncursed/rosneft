import { Suspense } from "react";
import { TourOverlay } from "@/features/onboarding";
import { PlaceObjectsModal } from "@/widgets/model-picker";
import { OverlaysPanel, overlaysWidthClass } from "@/widgets/overlays-panel";
import { PlacementsPanel } from "@/widgets/placements-panel";
import { UploadModal } from "@/widgets/upload-modal";
import { ViewTab } from "@/widgets/view-tab";
import { ViewerCanvas } from "@/widgets/viewer-canvas";
import { ViewerSkeleton } from "@/widgets/viewer-skeleton";
import type { TerritoryViewerPageProps } from "../model/page-props";
import { ViewerHeader } from "./viewer-header";
import { ViewerOverlays } from "./viewer-overlays";

export type { TerritoryViewerPageProps };

const CENTRED = "absolute inset-0 flex items-center justify-center p-3.5";

/**
 * The viewer screen: the header, then one positioned viewport holding the
 * canvas, everything drawn over it, the Overlays panel and the two things that
 * cover the lot — the model picker and the guided tour.
 *
 * It holds no hooks and takes no decisions; `useTerritoryViewer` has already
 * made all of them. The viewport container carries `overlaysWidthClass` so the
 * LOD switcher and the measure hint bar — both siblings of the panel, not its
 * children — can read `--overlays-w` and stop at its edge.
 */
export function TerritoryViewerPage({
  header,
  canvas,
  overlays,
  panel,
  picker,
  upload,
  tour,
  panoramaTour,
  loadingScene,
}: TerritoryViewerPageProps) {
  return (
    <>
      <ViewerHeader {...header} />

      <div
        className={`relative min-h-0 flex-1 bg-panel ${overlaysWidthClass(panel?.collapsed ?? true)}`}
      >
        <Suspense
          fallback={
            <div className={CENTRED}>
              <ViewerSkeleton />
            </div>
          }
        >
          <ViewerCanvas {...canvas} />
        </Suspense>

        <ViewerOverlays {...overlays} />

        {panel ? (
          <OverlaysPanel
            tab={panel.tab}
            onTabChange={panel.onTabChange}
            collapsed={panel.collapsed}
            onCollapsedChange={panel.onCollapsedChange}
            placementsCount={panel.placementsCount}
            // The step explains the two tabs, so the panel puts the anchor on
            // the strip itself — this component's own box is the viewport, and
            // the panel's root is a zero-height static block.
            tourId="overlays-tabs"
            view={<ViewTab {...panel.viewTab} />}
            placements={
              <div data-tour="objects-list">
                <PlacementsPanel {...panel.placements} />
              </div>
            }
          />
        ) : null}

        {loadingScene ? (
          <div className={CENTRED}>
            <ViewerSkeleton />
          </div>
        ) : null}

        <PlaceObjectsModal {...picker} />
        {upload ? <UploadModal {...upload} /> : null}
        {/* Two tours, never both: the viewer's explains the scene, the
            panorama's explains a capture, and only the one that was started
            has a step to draw. */}
        <TourOverlay tour={tour} />
        <TourOverlay tour={panoramaTour} />
      </div>
    </>
  );
}
