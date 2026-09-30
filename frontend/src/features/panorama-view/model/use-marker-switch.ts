import { useStoredChoice } from "@/shared/lib/use-stored-choice";

/** How the 3D view draws the panorama anchors: ring and title, ring alone, or nothing (D7). */
export type MarkerMode = "all" | "points" | "off";

const KEY = "andrey.panorama-markers";
// Absence is the default; "hidden" is the word the two-state switch wrote, so
// a browser's old choice still reads Off.
const STORED = { all: null, points: "points", off: "hidden" } as const satisfies Record<MarkerMode, string | null>;

/** The markers switch, remembered per browser under `andrey.panorama-markers`. */
export function useMarkerSwitch() {
  const [mode, setMode] = useStoredChoice<MarkerMode>(KEY, STORED);
  return { mode, setMode };
}
