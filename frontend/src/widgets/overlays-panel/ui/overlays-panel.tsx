import { useState, type ReactNode } from "react";
import { CollapsedRail } from "@/shared/ui/collapsed-rail";
import { Icon } from "@/shared/ui/icon";
import { Tooltip } from "@/shared/ui/tooltip";
import { Tabs } from "@/shared/ui/tabs";
import { overlaysWidthClass } from "../model/overlays-width";
import type { OverlaysTab } from "../model/use-overlays-panel";

export type OverlaysPanelProps = {
  tab: OverlaysTab;
  onTabChange: (tab: OverlaysTab) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  /** Drives the tab's count and the collapsed rail's badge. */
  placementsCount: number;
  /**
   * The onboarding tour's anchor for the tabs strip, emitted as `data-tour`.
   * It has to land on the strip itself: the overlay measures the element it
   * finds and draws its halo around that rect, and this component's own root
   * is a static block holding an absolutely-positioned aside — zero height, so
   * a wrapper around it would light nothing at all.
   */
  tourId?: string;
  view: ReactNode;
  placements: ReactNode;
};

const EDGES = "absolute right-3.5 top-3.5 bottom-3.5";

/**
 * Either face of the fold arrives from 8px to its right and fades in, so the
 * swap reads as one panel folding rather than two teleporting. Reduced motion
 * keeps the fade alone. The leaving face unmounts at once.
 */
const ENTERING =
  "transition-[opacity,translate] duration-200 ease-out starting:opacity-0 motion-safe:starting:translate-x-2";

/**
 * Mock state 9: the panel's own tabs stay put while the body scrolls, so a
 * reader who has scrolled past the metadata grid is told where it went.
 */
const SCROLLED = "scrolled · metadata above";

/** One panel for both tabs — only the active one is rendered. */
const PANEL_ID = "overlays-panel-body";

/**
 * The viewer's right-hand Overlays panel: the scene's own controls on one tab,
 * its placements on the other, folded away to a rail when the model needs the
 * room.
 *
 * The root wrapper carries `--overlays-w` — 320px open, 300 at 1280 and below,
 * 44px collapsed — so the LOD switcher can sit clear of whatever is on screen.
 * It goes on the same element that positions the aside and the rail, which is
 * what keeps the number honest through a fold. A CSS variable inherits
 * downward only, so a switcher that is the panel's sibling cannot read this
 * one: the page applies the same `overlaysWidthClass(collapsed)` to its
 * viewport container, and both stay in step because it is one function.
 */
export function OverlaysPanel({
  tab,
  onTabChange,
  collapsed,
  onCollapsedChange,
  placementsCount,
  tourId,
  view,
  placements,
}: OverlaysPanelProps) {
  const [scrolled, setScrolled] = useState(false);

  return (
    <div className={overlaysWidthClass(collapsed)}>
      {collapsed ? (
        <CollapsedRail
          className={`${EDGES} ${ENTERING}`}
          label="Overlays"
          badge={`${placementsCount} placed`}
          expandName="Expand Overlays panel"
          onExpand={() => onCollapsedChange(false)}
        />
      ) : (
        // Tailwind v4 max-[N] is exclusive; the mock's 1280 check wants 300 at 1280.
        // data-canvas-cover: the fly-around (viewer-canvas CameraRig) centres
        // the territory in what this face leaves of the canvas.
        <aside
          aria-label="Overlays"
          data-canvas-cover=""
          className={`${EDGES} ${ENTERING} flex w-[320px] max-[1281px]:w-[300px] flex-col overflow-hidden rounded-card border border-line bg-panel shadow-elevation`}
        >
          <div className="flex items-center justify-between gap-2.5 border-b border-line px-3.5 py-[13px]">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
              Overlays
            </span>
            <Tooltip label="Collapse Overlays panel">
              <button
                type="button"
                onClick={() => onCollapsedChange(true)}
                aria-label="Collapse Overlays panel"
                className="flex size-[26px] cursor-pointer items-center justify-center rounded-[7px] border border-line-2 bg-panel-2 text-fg transition-[color,border-color,scale] duration-150 ease-out hover:border-accent-line active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Icon name="chevron-right" size={13} />
              </button>
            </Tooltip>
          </div>
          <div data-tour={tourId}>
            <Tabs
              variant="segments"
              ariaLabel="Overlays sections"
              panelId={PANEL_ID}
              className="border-b border-line bg-panel-2 px-2.5 py-2"
              value={tab}
              onChange={onTabChange}
              tabs={[
                { value: "view", label: "View" },
                { value: "placements", label: `Placements (${placementsCount})` },
              ]}
            />
          </div>
          {/* The strip lies over the body, never in the flow: inserted, it
              pushed the body 26px down on the first pixel of a scroll. It
              fades in and leaves at once. */}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {scrolled ? (
              <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-1.5 border-b border-line bg-panel-2 px-3.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted transition-opacity duration-120 ease-out starting:opacity-0">
                <Icon name="chevron-up" size={11} />
                {SCROLLED}
              </div>
            ) : null}
            {/* tabIndex 0: the body scrolls, and a keyboard reader cannot reach a
                long placements list without a focusable scroll container. */}
            <div
              id={PANEL_ID}
              role="tabpanel"
              aria-labelledby={`${PANEL_ID}-${tab}`}
              tabIndex={0}
              onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
              className="flex-1 overflow-auto scroll-pt-[26px] p-3.5"
            >
              {tab === "view" ? view : placements}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
