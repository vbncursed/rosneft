import { useStoredSwitch } from "@/shared/lib/use-stored-switch";

/** Whether the panorama markers are drawn in the scene, remembered per browser. */
export function useMarkerSwitch() {
  const [showMarkers, toggle] = useStoredSwitch("andrey.panorama-markers");
  return { showMarkers, toggle };
}
