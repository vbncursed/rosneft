import { useCallback, useState } from "react";
import type { ViewerMode, ViewerView } from "@/features/viewer-mode";

/**
 * The Play toggle. A flight belongs to the mode and the view it took off in:
 * a pointer mode or a panorama lands it, and coming back does not take off
 * again. Reset and Focus land it through `stop`, and the rig reports a grab
 * the same way. The free cam takes the camera too: entering it lands a flight.
 * Leaving it does not, so Play from the free cam leaves it and takes off in one
 * click, and a reset keyed on `free` would cancel that take-off.
 */
export function useFlyAround(mode: ViewerMode, view: ViewerView["kind"], free: boolean) {
  const where = `${mode}:${view}`;
  const [playing, setPlaying] = useState(false);
  const [seen, setSeen] = useState(where);
  // Adjusted while rendering, React's pattern for state that a prop change
  // resets: an effect would hand the canvas one frame of the flight first.
  if (seen !== where) {
    setSeen(where);
    setPlaying(false);
  }
  if (free && playing) setPlaying(false);
  const toggle = useCallback(() => setPlaying((on) => !on), []);
  const stop = useCallback(() => setPlaying(false), []);
  return { playing, toggle, stop };
}
