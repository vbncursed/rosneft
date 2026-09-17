import { CollapsedRail } from "./collapsed-rail";

export default {
  withBadge: (
    <div className="rounded-card border border-line bg-panel p-6">
      <CollapsedRail label="Overlays" badge="4 placed" expandName="Expand Overlays panel" onExpand={() => {}} />
    </div>
  ),
  withoutBadge: (
    <div className="rounded-card border border-line bg-panel p-6">
      <CollapsedRail label="Overlays" expandName="Expand Overlays panel" onExpand={() => {}} />
    </div>
  ),
};
