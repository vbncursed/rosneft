import { describe, expect, it } from "vitest";
import { DEFAULT_SCALE, groupByModel, groupLine, instanceLine, instanceName, matchesObjects, realWorldScale } from "./groups";
import { IDENTITY_TRANSFORM, type Placement } from "./placement";

const p = (id: number, modelSlug: string, label = "", over: Partial<Placement> = {}): Placement =>
  ({ id, territorySlug: "t", modelSlug, label, updatedAt: "", visiblePanoramaIds: [], hidden: false, groupId: null, ...IDENTITY_TRANSFORM, ...over });
const options = [{ slug: "tank", title: "storage-tank-500" }, { slug: "pump", title: "Насос НМ-1250" }];

describe("groupByModel", () => {
  it("groups by model, titles sorted, instances numbered by id order", () => {
    const groups = groupByModel([p(9, "pump"), p(3, "tank", "Tank 3"), p(1, "tank"), p(5, "pump")], options);
    expect(groups.map((g) => g.model.title)).toEqual(["storage-tank-500", "Насос НМ-1250"]);
    expect(groups[0].instances).toEqual([
      { id: 1, index: 1, label: "", hidden: false, groupId: null },
      { id: 3, index: 2, label: "Tank 3", hidden: false, groupId: null },
    ]);
    expect(groups[1].instances.map((i) => i.id)).toEqual([5, 9]);
  });
  it("keeps a placement whose model is unknown, titled by its slug", () => {
    expect(groupByModel([p(1, "gone")], options)[0].model).toEqual({ slug: "gone", title: "gone" });
  });
  it("carries each placement's hidden flag and group onto its instance", () => {
    const [tank] = groupByModel([p(1, "tank", "", { hidden: true, groupId: 4 })], options);
    expect(tank.instances[0]).toMatchObject({ hidden: true, groupId: 4 });
  });
  it("is empty for no placements", () => {
    expect(groupByModel([], options)).toEqual([]);
  });
});

describe("names and lines", () => {
  const group = groupByModel([p(1, "tank"), p(3, "tank", "Tank 3")], options)[0];
  it("names an instance after its model and number", () => {
    expect(instanceName(group, group.instances[1])).toBe("storage-tank-500 #2");
  });
  it("prints the number, then the label when there is one", () => {
    expect(instanceLine(group.instances[0])).toBe("#1");
    expect(instanceLine(group.instances[1])).toBe("#2 · Tank 3");
  });
  it("counts instances and names the selected one", () => {
    expect(groupLine(group, null)).toBe("2 instances");
    expect(groupLine(group, 3)).toBe("2 instances · #2 selected");
    expect(groupLine({ ...group, instances: [group.instances[0]] }, null)).toBe("1 instance");
  });
  it("matches by title, slug or an instance label", () => {
    expect(matchesObjects(group, "TANK 3")).toBe(true);
    expect(matchesObjects(group, "storage")).toBe(true);
    expect(matchesObjects(group, "pump")).toBe(false);
    expect(matchesObjects(group, "")).toBe(true);
  });
});

describe("realWorldScale", () => {
  it("is the model's longest side over the territory's", () => {
    expect(realWorldScale({ bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 4, y: 2, z: 1 } }, 40)).toBe(0.1);
    expect(realWorldScale({ bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 8, y: 2, z: 1 } }, 40)).toBe(0.2);
  });
  it("falls back to the default without a bbox on either side", () => {
    expect(realWorldScale(undefined, 40)).toBe(DEFAULT_SCALE);
    expect(realWorldScale({ bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 4, y: 2, z: 1 } }, 0)).toBe(DEFAULT_SCALE);
    expect(realWorldScale({}, 40)).toBe(DEFAULT_SCALE);
  });
  it("falls back on a degenerate bbox rather than placing a zero-sized model", () => {
    expect(realWorldScale({ bboxMin: { x: 1, y: 1, z: 1 }, bboxMax: { x: 1, y: 1, z: 1 } }, 40)).toBe(DEFAULT_SCALE);
  });
});
