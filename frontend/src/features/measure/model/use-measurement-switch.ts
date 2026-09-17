import { useStoredSwitch } from "@/shared/lib/use-stored-switch";

/** Whether saved and local ruler chains are drawn in the scene, remembered per browser. */
export function useMeasurementSwitch() {
  const [showMeasurements, toggle] = useStoredSwitch("andrey.measurements");
  return { showMeasurements, toggle };
}
