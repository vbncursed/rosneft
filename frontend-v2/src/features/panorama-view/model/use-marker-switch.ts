import { useCallback, useState } from "react";

const KEY = "andrey.panorama-markers";

// Absence means "shown": a reader who has never touched the switch sees where
// the captures are. Only the hidden choice is worth storing.
const storedHidden = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "hidden";
  } catch {
    // Private windows and blocked site data throw on read.
    return false;
  }
};

/** Whether the panorama markers are drawn in the scene, remembered per browser. */
export function useMarkerSwitch() {
  const [showMarkers, setShowMarkers] = useState(() => !storedHidden());

  // The write stays out of the updater: React 19 StrictMode double-invokes
  // those, and a side effect in one runs twice.
  const toggle = useCallback(() => {
    const next = !showMarkers;
    try {
      if (next) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, "hidden");
    } catch {
      // A remembered switch is a convenience, not something to fail over.
    }
    setShowMarkers(next);
  }, [showMarkers]);

  return { showMarkers, toggle };
}
