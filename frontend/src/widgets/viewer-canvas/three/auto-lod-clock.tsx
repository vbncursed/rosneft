import { useEffect, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AutoLodBus, createSettleBus } from "./settle-bus";

type Listenable = {
  addEventListener: (type: "change", listener: () => void) => void;
  removeEventListener: (type: "change", listener: () => void) => void;
};

/**
 * Owns the scene's one settle clock: the controls listener, the timer and the
 * frame retry. The bus itself is in settle-bus.ts — a file exporting the
 * component beside functions and a context trips react/only-export-components.
 */
export function AutoLodClock({ children }: { children: ReactNode }) {
  const [bus] = useState(createSettleBus);
  // R3F types controls as a bare EventDispatcher whose event map has no
  // "change"; OrbitControls (CameraRig) and the specs' fake both fire it.
  const controls = useThree((s) => s.controls) as unknown as Listenable | null;
  useEffect(() => {
    if (!controls) return;
    controls.addEventListener("change", bus.settle);
    return () => controls.removeEventListener("change", bus.settle);
  }, [controls, bus]);
  useEffect(() => bus.stop, [bus]);
  useFrame(bus.frame);
  return <AutoLodBus value={bus}>{children}</AutoLodBus>;
}
