import { useCallback, useState } from "react";

/** How the 3D view draws the panorama anchors: ring and title, ring alone, or nothing (D7). */
export type MarkerMode = "all" | "points" | "off";

const KEY = "andrey.panorama-markers";
// What each mode leaves in storage. Absence is the default; "hidden" is the
// word the two-state switch wrote, so a browser's old choice still reads Off.
const STORED: Record<MarkerMode, string | null> = { all: null, points: "points", off: "hidden" };

const read = (): MarkerMode => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === "hidden" ? "off" : raw === "points" ? "points" : "all";
  } catch {
    // Private windows and blocked site data throw on read.
    return "all";
  }
};

/** The markers switch, remembered per browser under `andrey.panorama-markers`. */
export function useMarkerSwitch() {
  const [mode, setModeState] = useState<MarkerMode>(read);

  // The write stays out of an updater: React 19 StrictMode runs those twice.
  const setMode = useCallback((next: MarkerMode) => {
    try {
      const stored = STORED[next];
      if (stored === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, stored);
    } catch {
      // A remembered switch is a convenience, not something to fail over.
    }
    setModeState(next);
  }, []);

  return { mode, setMode };
}
