import { describe, expect, it } from "vitest";
import { groupByModel } from "./groups";
import { IDENTITY_TRANSFORM, type Placement } from "./placement";
import {
  eyeState,
  groupPlacements,
  matchesUserGroup,
  userGroupKey,
  userGroupLine,
} from "./sections";

const p = (id: number, modelSlug: string, over: Partial<Placement> = {}): Placement => ({
  id,
  territorySlug: "t",
  modelSlug,
  label: "",
  updatedAt: "",
  visiblePanoramaIds: [],
  hidden: false,
  groupId: null,
  ...IDENTITY_TRANSFORM,
  ...over,
});
const OPTIONS = [
  { slug: "tank", title: "storage-tank-500" },
  { slug: "pump", title: "pump-nm-1250" },
];
const GROUPS = [
  { id: 2, title: "West yard" },
  { id: 1, title: "East yard" },
];

describe("eyeState", () => {
  it("is visible, hidden or mixed by how many are hidden", () => {
    expect(eyeState([{ hidden: false }, { hidden: false }])).toBe("visible");
    expect(eyeState([{ hidden: true }, { hidden: true }])).toBe("hidden");
    expect(eyeState([{ hidden: true }, { hidden: false }])).toBe("mixed");
  });

  it("reads an empty set as visible — nothing in it is hidden", () => {
    expect(eyeState([])).toBe("visible");
  });
});

describe("groupPlacements", () => {
  const placements = [
    p(1, "tank", { groupId: 2 }),
    p(2, "tank"),
    p(3, "pump", { groupId: 2 }),
    p(4, "tank", { groupId: 1 }),
  ];
  const sections = groupPlacements(groupByModel(placements, OPTIONS), GROUPS);

  it("lists user groups alphabetically, each with its members and their models", () => {
    expect(sections.userGroups.map((s) => s.group.title)).toEqual(["East yard", "West yard"]);
    expect(sections.userGroups[1].members.map((m) => [m.model.model.slug, m.instance.id])).toEqual([
      ["pump", 3],
      ["tank", 1],
    ]);
  });

  // #N is the model's: moving a placement must never rename it.
  it("keeps each instance's number within its model, whichever group holds it", () => {
    expect(sections.userGroups[0].members[0].instance).toMatchObject({ id: 4, index: 3 });
  });

  it("lists under a model only what no group claims, and drops a model with nothing left", () => {
    expect(sections.modelGroups.map((s) => [s.group.model.slug, s.shown.map((i) => i.id)])).toEqual([
      ["tank", [2]],
    ]);
  });

  // G-3: the model's eye covers every placement of it, grouped ones too.
  it("keeps every placement of the model on its section, for the eye", () => {
    expect(sections.modelGroups[0].group.instances.map((i) => i.id)).toEqual([1, 2, 4]);
  });

  it("keeps an empty group, so a new one can be filled", () => {
    const empty = groupPlacements([], [{ id: 9, title: "New" }]);
    expect(empty.userGroups).toEqual([{ group: { id: 9, title: "New" }, members: [] }]);
  });

  it("treats a group id it does not know as no group at all", () => {
    const orphan = groupPlacements(groupByModel([p(1, "tank", { groupId: 77 })], OPTIONS), GROUPS);
    expect(orphan.modelGroups[0].shown.map((i) => i.id)).toEqual([1]);
  });
});

describe("user group lines and search", () => {
  const [east, west] = groupPlacements(
    groupByModel([p(1, "tank", { groupId: 2, label: "north row" }), p(2, "tank", { groupId: 2 })], OPTIONS),
    GROUPS,
  ).userGroups;

  it("keys a group apart from any model slug", () => {
    expect(userGroupKey(7)).toBe("group:7");
  });

  it("counts objects and names the selected one", () => {
    expect(userGroupLine(west, null)).toBe("2 objects");
    expect(userGroupLine(west, 2)).toBe("2 objects · storage-tank-500 #2 selected");
    expect(userGroupLine({ ...west, members: west.members.slice(0, 1) }, null)).toBe("1 object");
    expect(userGroupLine(east, null)).toBe("No objects yet");
  });

  it("matches by the group's title, or by any member", () => {
    expect(matchesUserGroup(west, "WEST")).toBe(true);
    expect(matchesUserGroup(west, "north row")).toBe(true);
    expect(matchesUserGroup(west, "storage")).toBe(true);
    expect(matchesUserGroup(west, "pump")).toBe(false);
    expect(matchesUserGroup(east, "  ")).toBe(true);
  });
});
