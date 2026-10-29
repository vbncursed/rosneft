import type { ThreeEvent } from "@react-three/fiber";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePointPicking } from "./use-point-picking";

const click = (native: Event, hits: { x: number; y: number; z: number }[] = []) => {
  const stopPropagation = vi.fn();
  const event = {
    nativeEvent: native,
    intersections: hits.map((point) => ({ point })),
    point: { x: 9, y: 9, z: 9 },
    stopPropagation,
  } as unknown as ThreeEvent<MouseEvent>;
  return { event, stopPropagation };
};

describe("usePointPicking", () => {
  it("deselects on an empty-space click while orbiting, and leaves the pending point alone while picking", () => {
    const onPick = vi.fn();
    renderHook(() => usePointPicking(false, onPick, vi.fn())).result.current.handlePointerMissed();
    expect(onPick).toHaveBeenCalledWith(null);

    const picking = vi.fn();
    renderHook(() => usePointPicking(true, picking, vi.fn())).result.current.handlePointerMissed();
    expect(picking).not.toHaveBeenCalled();
  });

  it("reports the first intersection's point once per native click and stops its propagation", () => {
    const onMeasurePoint = vi.fn();
    const { result } = renderHook(() => usePointPicking(true, vi.fn(), onMeasurePoint));
    const native = new MouseEvent("click");
    const first = click(native, [
      { x: 1, y: 2, z: 3 },
      { x: 4, y: 5, z: 6 },
    ]);
    result.current.handleSceneClick(first.event);
    result.current.handleSceneClick(click(native, [{ x: 4, y: 5, z: 6 }]).event);
    expect(onMeasurePoint).toHaveBeenCalledTimes(1);
    expect(onMeasurePoint).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 });
    expect(first.stopPropagation).toHaveBeenCalledOnce();
    result.current.handleSceneClick(click(new MouseEvent("click")).event);
    expect(onMeasurePoint).toHaveBeenLastCalledWith({ x: 9, y: 9, z: 9 });
  });

  it("ignores scene clicks while orbiting", () => {
    const onMeasurePoint = vi.fn();
    const { event, stopPropagation } = click(new MouseEvent("click"), [{ x: 1, y: 2, z: 3 }]);
    renderHook(() => usePointPicking(false, vi.fn(), onMeasurePoint)).result.current.handleSceneClick(event);
    expect(onMeasurePoint).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });
});
