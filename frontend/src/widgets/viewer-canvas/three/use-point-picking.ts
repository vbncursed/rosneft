import { useCallback, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";

type Point = { x: number; y: number; z: number };

/** The canvas's two click handlers: an empty-space click deselects while orbiting, a scene click picks a point otherwise. */
export function usePointPicking(pointMode: boolean, onPick: (id: null) => void, onMeasurePoint: (p: Point) => void) {
  const handlePointerMissed = useCallback(() => {
    // While picking points an empty-space click is just "no surface" — leave
    // the pending point alone. Otherwise treat empty clicks as deselect.
    if (!pointMode) onPick(null);
  }, [pointMode, onPick]);

  // Dedupe handle: R3F dispatches one synthetic event per raycast
  // intersection, but they all share the same DOM nativeEvent. We
  // process only the first event per native click; the rest are ignored.
  // (stopPropagation alone is not enough — separate intersection events
  // start with fresh `stopped` state and can still reach the wrapper.)
  const lastNativeRef = useRef<Event | null>(null);

  // Wrapper-group click is the catch-all for in-scene points. Use the first
  // intersection's world point — that's the surface the user actually
  // targeted, regardless of how many objects sit behind it.
  const handleSceneClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (!pointMode) return;
      if (lastNativeRef.current === event.nativeEvent) return;
      lastNativeRef.current = event.nativeEvent;
      event.stopPropagation();
      const hit = event.intersections[0]?.point ?? event.point;
      onMeasurePoint({ x: hit.x, y: hit.y, z: hit.z });
    },
    [pointMode, onMeasurePoint],
  );

  return { handlePointerMissed, handleSceneClick };
}
