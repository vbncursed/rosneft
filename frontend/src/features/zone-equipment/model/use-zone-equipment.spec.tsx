import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Zone } from "@/entities/zone";
import { useZoneEquipment } from "./use-zone-equipment";

// Two scene units wide at 50 m per unit is 100 m: a ratio the wrong way round
// would print 0.04.
const zone = (over: Partial<Zone> = {}): Zone => ({
  id: 1,
  title: "Tank row",
  corners: [
    { x: 0, y: 3, z: 0 },
    { x: 0.2, y: 3, z: 0 },
    { x: 0.2, y: 3, z: 0.1 },
    { x: 0, y: 3, z: 0.1 },
  ],
  tags: [{ slug: "tanks", title: "Tanks" }],
  drawingWidthM: 10,
  drawingHeightM: 5,
  createdAt: "",
  updatedAt: "",
  ...over,
});

const at = (x: number, z: number, hidden = false) => ({ position: { x, y: 0, z }, hidden });

const hook = (z: Zone | null, placements = [at(0.1, 0.05)], unitRatio = 50, create = vi.fn().mockResolvedValue(1)) =>
  renderHook(() => useZoneEquipment({ zone: z, placements, unitRatio, create }));

describe("useZoneEquipment", () => {
  it("measures the zone in metres per scene unit, not the other way round", () => {
    const { result } = hook(zone());
    expect(result.current.sizeLine?.text).toBe("Drawing 10.0 × 5.0 m · Model 10.0 × 5.0 m (0 %)");
  });

  it("has no size line without a drawing size", () => {
    const { result } = hook(zone({ drawingWidthM: null, drawingHeightM: null }));
    expect(result.current.sizeLine).toBeNull();
  });

  it("counts the visible placements inside the zone", () => {
    const { result } = hook(zone(), [at(0.1, 0.05), at(0.1, 0.05, true), at(5, 5)]);
    expect(result.current.inside).toBe(1);
  });

  it("places from the zone's centre, along its long side", async () => {
    const create = vi.fn().mockResolvedValue(1);
    const { result } = hook(zone(), [], 50, create);
    await act(async () => result.current.onPlace("storage-tank-500", 3));
    expect(create).toHaveBeenCalledWith("storage-tank-500", 3, null, {
      position: { x: expect.closeTo(0.1, 10), y: 3, z: expect.closeTo(0.05, 10) },
      yaw: expect.closeTo(0, 10),
    });
  });

  it("places nothing without a zone", async () => {
    const create = vi.fn();
    const { result } = hook(null, [], 50, create);
    await act(async () => result.current.onPlace("tank", 1));
    expect(create).not.toHaveBeenCalled();
    expect(result.current.inside).toBe(0);
    expect(result.current.sizeLine).toBeNull();
  });
});
