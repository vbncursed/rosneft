import { useCallback, useState } from "react";
import type { ViewerMode, ViewerView } from "@/features/viewer-mode";

/**
 * The Play toggle. A flight belongs to the mode and the view it took off in:
 * a pointer mode or a panorama lands it, and coming back does not take off
 * again. Reset and Focus land it through `stop`, and the rig reports a grab
 * the same way.
 */
export function useFlyAround(mode: ViewerMode, view: ViewerView["kind"]) {
  const where = `${mode}:${view}`;
  const [playing, setPlaying] = useState(false);
  const [seen, setSeen] = useState(where);
  // Adjusted while rendering, React's pattern for state that a prop change
  // resets: an effect would hand the canvas one frame of the flight first.
  if (seen !== where) {
    setSeen(where);
    setPlaying(false);
  }
  const toggle = useCallback(() => setPlaying((on) => !on), []);
  const stop = useCallback(() => setPlaying(false), []);
  return { playing, toggle, stop };
}
