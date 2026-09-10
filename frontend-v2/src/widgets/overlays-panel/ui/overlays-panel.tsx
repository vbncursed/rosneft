import type { ReactNode } from "react";
import { CollapsedRail } from "@/shared/ui/collapsed-rail";
import { Icon } from "@/shared/ui/icon";
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
  view: ReactNode;
  placements: ReactNode;
};

const EDGES = "absolute right-3.5 top-3.5 bottom-3.5";

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
  view,
  placements,
}: OverlaysPanelProps) {
  return (
    <div className={overlaysWidthClass(collapsed)}>
      {collapsed ? (
        <CollapsedRail
          className={EDGES}
          label="Overlays"
          badge={`${placementsCount} placed`}
          expandName="Expand Overlays panel"
          onExpand={() => onCollapsedChange(false)}
        />
      ) : (
        // Tailwind v4 max-[N] is exclusive; the mock's 1280 check wants 300 at 1280.
        <aside
          aria-label="Overlays"
          className={`${EDGES} flex w-[320px] max-[1281px]:w-[300px] flex-col overflow-hidden rounded-card border border-line bg-panel shadow-elevation`}
        >
          <div className="flex items-center justify-between gap-2.5 border-b border-line px-3.5 py-[13px]">
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted">
              Overlays
            </span>
            <button
              type="button"
              onClick={() => onCollapsedChange(true)}
              aria-label="Collapse Overlays panel"
              title="Collapse Overlays panel"
              className="flex size-[26px] cursor-pointer items-center justify-center rounded-[7px] border border-line-2 bg-panel-2 text-fg transition-colors duration-150 hover:border-accent-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Icon name="chevron-right" size={13} />
            </button>
          </div>
          <Tabs
            variant="segments"
            ariaLabel="Overlays sections"
            className="border-b border-line bg-panel-2 px-2.5 py-2"
            value={tab}
            onChange={onTabChange}
            tabs={[
              { value: "view", label: "View" },
              { value: "placements", label: `Placements (${placementsCount})` },
            ]}
          />
          <div className="flex-1 overflow-auto p-3.5">{tab === "view" ? view : placements}</div>
        </aside>
      )}
    </div>
  );
}
