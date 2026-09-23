import { describe, expect, it } from "vitest";
import { groupByModel } from "@/entities/placement";
import { basePageParts } from "../territory-viewer-page.fixture";
import { placementsPanelProps } from "./page-props-placements";
import type { PageParts } from "./viewer-props";

const withGroup = (p: PageParts): PageParts => ({
  ...p,
  placements: p.placements.map((x) => (x.id === 4 ? { ...x, groupId: 1 } : x)),
  placementGroups: { ...p.placementGroups, list: [{ id: 1, title: "Valve bank" }] },
});

const build = (p: PageParts) => placementsPanelProps(p, groupByModel(p.placements, p.options));

describe("placementsPanelProps", () => {
  it("splits the placements into the user groups and what no group holds", () => {
    const { sections } = build(withGroup(basePageParts()));
    expect(sections.userGroups.map((s) => [s.group.title, s.members.map((m) => m.instance.id)])).toEqual([
      ["Valve bank", [4]],
    ]);
    expect(sections.modelGroups.map((s) => s.group.model.slug)).toEqual(["storage-tank-500"]);
  });

  it("hands the group writes and the three new callbacks straight through", () => {
    const p = basePageParts();
    const props = build(p);
    expect(props.groupActions).toEqual({
      busy: false,
      onCreate: p.placementGroups.create,
      onRename: p.placementGroups.rename,
      onDelete: p.placementGroups.remove,
    });
    expect(props.onSetHidden).toBe(p.on.onSetHidden);
    expect(props.onMoveToGroup).toBe(p.on.onMoveToGroup);
    expect(props.onAddToGroup).toBe(p.on.onAddToGroup);
  });

  it("keeps Add off inside a panorama", () => {
    const p = basePageParts();
    expect(build({ ...p, mode: { ...p.mode, view: { kind: "panorama", id: 1 } } }).canAdd).toBe(false);
  });

  it("names the selected instance the way the list does, grouped or not", () => {
    const p = withGroup(basePageParts());
    expect(build({ ...p, mode: { ...p.mode, selectedId: 4 } }).selected?.name).toBe("valve-assembly #1");
  });
});
