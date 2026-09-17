import { useState } from "react";

export type OverlaysTab = "view" | "placements";

const KEY = "andrey.overlays";

const storedCollapsed = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "collapsed";
  } catch {
    // Private windows and blocked site data throw on read; open is a
    // perfectly good answer.
    return false;
  }
};

const remember = (collapsed: boolean) => {
  try {
    if (collapsed) localStorage.setItem(KEY, "collapsed");
    else localStorage.removeItem(KEY);
  } catch {
    // A remembered fold is a convenience, not something to fail over.
  }
};

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
  const [collapsed, setCollapsedState] = useState(storedCollapsed);

  // Adjust the active tab during render (React's recommended alternative to
  // an effect) when the selection transitions to a real placement.
  const [prevSelected, setPrevSelected] = useState(selectedPlacementId);
  if (selectedPlacementId !== prevSelected) {
    setPrevSelected(selectedPlacementId);
    if (selectedPlacementId !== null) setTab("placements");
  }

  // The tour's forceExpanded shows the panel without touching what was
  // remembered — the fold is the reader's choice, and it survives the tour.
  const setCollapsed = (next: boolean) => {
    setCollapsedState(next);
    remember(next);
  };

  return {
    tab: forcedTab ?? tab,
    collapsed: forceExpanded ? false : collapsed,
    setTab,
    setCollapsed,
  };
}
