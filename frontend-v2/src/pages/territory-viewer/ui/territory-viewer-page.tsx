import { Suspense } from "react";
import { TourOverlay } from "@/features/onboarding";
import { DetailList } from "@/shared/ui/detail-list";
import { PlaceObjectsModal } from "@/widgets/model-picker";
import { OverlaysPanel, overlaysWidthClass } from "@/widgets/overlays-panel";
import { PlacementsPanel } from "@/widgets/placements-panel";
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
  tour,
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
          // The tour's `overlays-tabs` step points at the panel as a whole:
          // its body names both tabs, and the halo is measured off whatever
          // carries the attribute.
          <div data-tour="overlays-tabs">
            <OverlaysPanel
              tab={panel.tab}
              onTabChange={panel.onTabChange}
              collapsed={panel.collapsed}
              onCollapsedChange={panel.onCollapsedChange}
              placementsCount={panel.placementsCount}
              view={<DetailList items={panel.details} />}
              placements={
                <div data-tour="objects-list">
                  <PlacementsPanel {...panel.placements} />
                </div>
              }
            />
          </div>
        ) : null}

        {loadingScene ? (
          <div className={CENTRED}>
            <ViewerSkeleton />
          </div>
        ) : null}

        <PlaceObjectsModal {...picker} />
        <TourOverlay tour={tour} />
      </div>
    </>
  );
}
