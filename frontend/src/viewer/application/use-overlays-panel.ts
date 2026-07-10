import { useState } from "react";
import type { OverlaysTab } from "@/viewer/domain/overlays-tab";

// useOverlaysPanel owns the right rail's tab and collapsed state, which used to
// live inside OverlaysPanel. It is lifted because the onboarding tour has to
// reveal a control before it can point at one: `forcedTab` and `forceExpanded`
// override the user's choice for as long as the tour is running.
//
// The override is applied during render, not from an effect. A tour step and
// the panel it points at must land in the same commit — otherwise the overlay
// measures the anchor before the tab it lives on exists.
export function useOverlaysPanel(
  selectedPlacementId: number | null,
  forcedTab: OverlaysTab | undefined,
  forceExpanded: boolean,
) {
  const [tab, setTab] = useState<OverlaysTab>("view");
  const [collapsed, setCollapsed] = useState(false);

  // Adjust the active tab during render (React's recommended alternative to
  // an effect) when the selection transitions to a real placement.
  const [prevSelected, setPrevSelected] = useState(selectedPlacementId);
  if (selectedPlacementId !== prevSelected) {
    setPrevSelected(selectedPlacementId);
    if (selectedPlacementId !== null) setTab("placements");
  }

  return {
    tab: forcedTab ?? tab,
    collapsed: forceExpanded ? false : collapsed,
    setTab,
    setCollapsed,
  };
}
