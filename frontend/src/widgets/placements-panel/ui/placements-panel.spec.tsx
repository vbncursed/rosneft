import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { groupByModel, groupPlacements, IDENTITY_TRANSFORM, type Placement } from "@/entities/placement";
import { GUEST_FOOTER, NO_DELETE_FOOTER } from "../model/panel-copy";
import { PlacementsPanel, type PlacementsPanelProps } from "./placements-panel";

const make = (id: number, modelSlug: string, label = "", over: Partial<Placement> = {}): Placement => ({
  id, territorySlug: "t", modelSlug, label, updatedAt: "", visiblePanoramaIds: [], hidden: false, groupId: null, ...IDENTITY_TRANSFORM, ...over,
});
const OPTIONS = [
  { slug: "pipe-rack-12", title: "pipe-rack-12" },
  { slug: "storage-tank-500", title: "storage-tank-500" },
];
const SECTIONS = groupPlacements(
  groupByModel([make(7, "pipe-rack-12", "west run"), make(1, "storage-tank-500"), make(2, "storage-tank-500", "north row")], OPTIONS),
  [],
);
const EMPTY = { userGroups: [], modelGroups: [] };

const base: PlacementsPanelProps = {
  sections: SECTIONS,
  query: "",
  onQuery: vi.fn(),
  expandedModel: null,
  onToggleGroup: vi.fn(),
  selectedId: null,
  onSelect: vi.fn(),
  pendingIds: [],
  grants: { create: true, write: true, delete: true },
  onAdd: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onFocus: vi.fn(),
  selected: null,
  onSetHidden: vi.fn(),
  onMoveToGroup: vi.fn(),
  onAddToGroup: vi.fn(),
  groupActions: { busy: false, onCreate: vi.fn(), onRename: vi.fn(), onDelete: vi.fn() },
};

const SELECTED = {
  name: "storage-tank-500 #2",
  gizmo: "translate" as const,
  onGizmo: vi.fn(),
  transform: {
    position: { x: 12.4, y: 0, z: -8.25 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  },
  snap: true,
  onSnap: vi.fn(),
  canWrite: true,
  form: null,
  compact: false,
};

describe("PlacementsPanel", () => {
  it("draws the search and one row per model, collapsed", () => {
    render(<PlacementsPanel {...base} />);
    expect(screen.getByRole("searchbox", { name: "Search objects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "pipe-rack-12" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("button", { name: "storage-tank-500" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /storage-tank-500 #2/ })).toBeNull();
  });

  it("reports a toggle and shows the instances of the expanded model", async () => {
    const onToggleGroup = vi.fn();
    const { rerender } = render(<PlacementsPanel {...base} onToggleGroup={onToggleGroup} />);
    await userEvent.click(screen.getByRole("button", { name: "storage-tank-500" }));
    expect(onToggleGroup).toHaveBeenCalledWith("storage-tank-500");

    rerender(<PlacementsPanel {...base} expandedModel="storage-tank-500" />);
    expect(screen.getByRole("button", { name: "storage-tank-500 #1" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "storage-tank-500 #2 · north row" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pipe-rack-12 #1/ })).toBeNull();
  });

  it("keeps the group holding the selection open even when another model is the expanded one", () => {
    render(<PlacementsPanel {...base} expandedModel="pipe-rack-12" selectedId={2} />);
    expect(screen.getByRole("button", { name: "storage-tank-500 #2 · north row" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "pipe-rack-12 #1 · west run" })).toBeInTheDocument();
  });

  it("offers the add button only with the create grant", async () => {
    const onAdd = vi.fn();
    const { rerender } = render(<PlacementsPanel {...base} onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: /Add objects to territory/ }));
    expect(onAdd).toHaveBeenCalledOnce();

    rerender(<PlacementsPanel {...base} grants={{ create: false, write: true, delete: true }} />);
    expect(screen.queryByRole("button", { name: /Add objects to territory/ })).toBeNull();
  });

  it("answers an empty territory with the sentence and the way forward", () => {
    render(<PlacementsPanel {...base} sections={EMPTY} />);
    expect(screen.getByText("No objects placed yet")).toBeInTheDocument();
    expect(screen.getByText(/each instance keeps its own position/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add objects to territory/ })).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("leaves an empty territory without a way forward when the reader cannot place", () => {
    render(
      <PlacementsPanel {...base} sections={EMPTY} grants={{ create: false, write: false, delete: false }} />,
    );
    expect(screen.getByText("No objects placed yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Add objects to territory/ })).toBeNull();
  });

  it("says what each set of grants leaves out, and says nothing to a full editor", () => {
    const { rerender } = render(<PlacementsPanel {...base} />);
    expect(screen.queryByText(GUEST_FOOTER)).toBeNull();
    expect(screen.queryByText(NO_DELETE_FOOTER)).toBeNull();

    rerender(<PlacementsPanel {...base} grants={{ create: true, write: true, delete: false }} />);
    expect(screen.getByText(NO_DELETE_FOOTER)).toBeInTheDocument();

    rerender(<PlacementsPanel {...base} grants={{ create: false, write: false, delete: false }} />);
    expect(screen.getByText(GUEST_FOOTER)).toBeInTheDocument();
  });

  it("filters the list by the query and reports what is typed", async () => {
    const onQuery = vi.fn();
    render(<PlacementsPanel {...base} query="tank" onQuery={onQuery} />);
    expect(screen.getByRole("button", { name: "storage-tank-500" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "pipe-rack-12" })).toBeNull();

    await userEvent.type(screen.getByRole("searchbox", { name: "Search objects" }), "s");
    expect(onQuery).toHaveBeenCalledWith("tanks");
  });

  it("hangs the selected block under the list when something is selected", () => {
    render(<PlacementsPanel {...base} selectedId={2} selected={SELECTED} />);
    expect(screen.getByText("Selected")).toBeInTheDocument();
    expect(screen.getByText("storage-tank-500 #2")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Pos" })).toHaveTextContent("12.400");
  });

  it("hands a guest Focus in place of the row actions", () => {
    render(
      <PlacementsPanel
        {...base}
        expandedModel="pipe-rack-12"
        grants={{ create: false, write: false, delete: false }}
      />,
    );
    expect(screen.getByRole("button", { name: "Focus pipe-rack-12 #1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Rename/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
  });

  it("makes a row with a mutation in flight wait", () => {
    render(<PlacementsPanel {...base} expandedModel="pipe-rack-12" pendingIds={[7]} />);
    expect(screen.getByRole("button", { name: "Rename pipe-rack-12 #1" })).toBeDisabled();
  });

  describe("visibility", () => {
    const VISIBILITY = {
      panoramas: [
        { id: 10, title: "Control room, north door" },
        { id: 11, title: "Tank yard, west gate" },
      ],
      visiblePanoramaIds: [10],
      onToggle: vi.fn(),
    };

    it("hangs the Visible in block under the selected instance's row, inside its group", () => {
      render(
        <PlacementsPanel
          {...base}
          expandedModel="storage-tank-500"
          selectedId={2}
          visibility={VISIBILITY}
        />,
      );
      expect(screen.getByText("Visible in")).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "Control room, north door" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Tank yard, west gate" })).not.toBeChecked();
    });

    it("draws nothing extra when visibility is null", () => {
      render(<PlacementsPanel {...base} expandedModel="storage-tank-500" selectedId={2} />);
      expect(screen.queryByText("Visible in")).toBeNull();
    });

    it("draws nothing under a row that is not the selection", () => {
      render(
        <PlacementsPanel
          {...base}
          expandedModel="storage-tank-500"
          selectedId={null}
          visibility={VISIBILITY}
        />,
      );
      expect(screen.queryByText("Visible in")).toBeNull();
    });

    it("reports a toggle with the placement id, the panorama id and the next state", async () => {
      const onToggle = vi.fn();
      render(
        <PlacementsPanel
          {...base}
          expandedModel="storage-tank-500"
          selectedId={2}
          visibility={{ ...VISIBILITY, onToggle }}
        />,
      );
      await userEvent.click(screen.getByRole("checkbox", { name: "Tank yard, west gate" }));
      expect(onToggle).toHaveBeenCalledWith(2, 11, true);
    });

    it("waits the checkboxes while the selected instance has a mutation in flight", () => {
      render(
        <PlacementsPanel
          {...base}
          expandedModel="storage-tank-500"
          selectedId={2}
          pendingIds={[2]}
          visibility={VISIBILITY}
        />,
      );
      expect(screen.getByRole("checkbox", { name: "Control room, north door" })).toBeDisabled();
    });
  });

  describe("canAdd", () => {
    it("keeps the Add button off even with the create grant", () => {
      render(<PlacementsPanel {...base} canAdd={false} />);
      expect(screen.queryByRole("button", { name: /Add objects to territory/ })).toBeNull();
    });

    it("keeps the empty state's own action off too", () => {
      render(<PlacementsPanel {...base} sections={EMPTY} canAdd={false} />);
      expect(screen.queryByRole("button", { name: /Add objects to territory/ })).toBeNull();
    });
  });

  describe("groups", () => {
    const grouped = groupPlacements(
      groupByModel([make(1, "storage-tank-500", "", { groupId: 5 }), make(2, "storage-tank-500"), make(7, "pipe-rack-12")], OPTIONS),
      [{ id: 5, title: "West yard" }, { id: 6, title: "East yard" }],
    );

    it("lists user groups alphabetically above the model rows, a rule between", () => {
      render(<PlacementsPanel {...base} sections={grouped} />);
      const lists = screen.getAllByRole("list");
      expect(lists[0]).toHaveAccessibleName("Groups");
      expect(lists[1]).toHaveAccessibleName("Objects");
      // By position in the Groups list: "yard" also ends the eye's and the menu's names.
      const text = lists[0].textContent ?? "";
      expect(text.indexOf("East yard")).toBeLessThan(text.indexOf("West yard"));
      expect(screen.getByRole("separator")).toBeInTheDocument();
    });

    it("finds a group by the title of a model inside it", () => {
      render(<PlacementsPanel {...base} sections={grouped} query="storage" />);
      expect(screen.getByRole("button", { name: "West yard" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "East yard" })).toBeNull();
    });

    it("opens a user group on its key and reports its toggle", async () => {
      const onToggleGroup = vi.fn();
      const { rerender } = render(<PlacementsPanel {...base} sections={grouped} onToggleGroup={onToggleGroup} />);
      await userEvent.click(screen.getByRole("button", { name: "West yard" }));
      expect(onToggleGroup).toHaveBeenCalledWith("group:5");
      rerender(<PlacementsPanel {...base} sections={grouped} expandedModel="group:5" />);
      expect(screen.getByRole("button", { name: "storage-tank-500 #1" })).toBeInTheDocument();
    });

    it("offers New group to a writer, even on an empty territory, and creates through the actions", async () => {
      const onCreate = vi.fn();
      render(<PlacementsPanel {...base} sections={EMPTY} groupActions={{ ...base.groupActions, onCreate }} />);
      await userEvent.click(screen.getByRole("button", { name: "New group" }));
      await userEvent.type(screen.getByRole("textbox", { name: "New group title" }), "Tank farm{Enter}");
      expect(onCreate).toHaveBeenCalledWith("Tank farm");
    });

    it("offers no New group without write", () => {
      render(<PlacementsPanel {...base} grants={{ create: true, write: false, delete: false }} />);
      expect(screen.queryByRole("button", { name: "New group" })).toBeNull();
    });

    it("keeps a group's own Add off inside a panorama", () => {
      render(<PlacementsPanel {...base} sections={grouped} expandedModel="group:5" canAdd={false} />);
      expect(screen.queryByRole("button", { name: /Add objects to group/ })).toBeNull();
    });

    it("hands a group's Add its id", async () => {
      const onAddToGroup = vi.fn();
      render(<PlacementsPanel {...base} sections={grouped} expandedModel="group:5" onAddToGroup={onAddToGroup} />);
      await userEvent.click(screen.getByRole("button", { name: "Add objects to group West yard" }));
      expect(onAddToGroup).toHaveBeenCalledWith(5);
    });
  });
});
