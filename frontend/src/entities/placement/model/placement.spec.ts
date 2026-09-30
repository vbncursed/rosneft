import { describe, expect, it } from "vitest";
import { isShownIn, isVisibleIn, toDegrees, toRadians, type Placement, type PlacementGroup } from "./placement";

const placement = (visiblePanoramaIds: number[] = []): Placement => ({
  id: 1,
  territorySlug: "refinery-block-c",
  modelSlug: "pump-jack",
  label: "Pump Jack Unit",
  updatedAt: "2026-08-31T14:02:00Z",
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  visiblePanoramaIds,
  hidden: false,
  groupId: null,
});

describe("isVisibleIn", () => {
  it("shows every placement in the plain 3D view", () => {
    expect(isVisibleIn(placement([]), null)).toBe(true);
    expect(isVisibleIn(placement([4]), null)).toBe(true);
  });

  it("shows a placement only in the panoramas it lists", () => {
    expect(isVisibleIn(placement([4, 7]), 4)).toBe(true);
    expect(isVisibleIn(placement([4, 7]), 9)).toBe(false);
  });

  it("hides a placement with an empty allowlist from every panorama", () => {
    expect(isVisibleIn(placement([]), 4)).toBe(false);
  });
});

describe("toDegrees / toRadians", () => {
  it("converts the quarter turns exactly", () => {
    expect(toDegrees(Math.PI)).toBe(180);
    expect(toDegrees(Math.PI / 2)).toBe(90);
    expect(toDegrees(0)).toBe(0);
  });

  it("handles negative rotation", () => {
    expect(toDegrees(-Math.PI / 2)).toBe(-90);
  });

  it("round-trips a typed value back to the same angle", () => {
    for (const degrees of [0, 45, 90, 180, -137.5]) {
      expect(toDegrees(toRadians(degrees))).toBeCloseTo(degrees, 2);
    }
  });

  it("rounds to two decimals, so the form does not show float noise", () => {
    expect(toDegrees(1)).toBe(57.3);
  });
});

describe("isShownIn", () => {
  const group = (hidden: boolean): PlacementGroup[] => [{ id: 4, title: "East yard", hidden }];

  // D5/D6: an item is drawn only when neither it nor its group is hidden;
  // showing the group again does not show an item hidden on its own.
  it.each([
    [false, false, true],
    [true, false, false],
    [false, true, false],
    [true, true, false],
  ])("item hidden %s × group hidden %s → drawn %s", (hidden, groupHidden, drawn) => {
    const p = { ...placement([4]), hidden, groupId: 4 };
    expect(isShownIn(p, null, group(groupHidden))).toBe(drawn);
    expect(isShownIn(p, 4, group(groupHidden))).toBe(drawn);
  });

  it("ignores a hidden group it does not sit in, and a groupId naming no known group", () => {
    expect(isShownIn({ ...placement([4]), groupId: 9 }, null, group(true))).toBe(true);
    expect(isShownIn(placement([4]), null, group(true))).toBe(true);
  });

  it("otherwise follows the panorama allowlist", () => {
    expect(isShownIn(placement([4]), null, [])).toBe(true);
    expect(isShownIn(placement([4]), 4, [])).toBe(true);
    expect(isShownIn(placement([4]), 9, [])).toBe(false);
  });
});
