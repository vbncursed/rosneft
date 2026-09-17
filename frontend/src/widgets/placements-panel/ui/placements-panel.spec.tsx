import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PlacementGroup } from "@/entities/placement";
import { GUEST_FOOTER, NO_DELETE_FOOTER } from "../model/panel-copy";
import { PlacementsPanel, type PlacementsPanelProps } from "./placements-panel";

const GROUPS: PlacementGroup[] = [
  {
    model: { slug: "pipe-rack-12", title: "pipe-rack-12" },
    instances: [{ id: 7, index: 1, label: "west run" }],
  },
  {
    model: { slug: "storage-tank-500", title: "storage-tank-500" },
    instances: [
      { id: 1, index: 1, label: "" },
      { id: 2, index: 2, label: "north row" },
    ],
  },
];

const base: PlacementsPanelProps = {
  groups: GROUPS,
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
    render(<PlacementsPanel {...base} groups={[]} />);
    expect(screen.getByText("No objects placed yet")).toBeInTheDocument();
    expect(screen.getByText(/each instance keeps its own position/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add objects to territory/ })).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("leaves an empty territory without a way forward when the reader cannot place", () => {
    render(
      <PlacementsPanel {...base} groups={[]} grants={{ create: false, write: false, delete: false }} />,
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
      render(<PlacementsPanel {...base} groups={[]} canAdd={false} />);
      expect(screen.queryByRole("button", { name: /Add objects to territory/ })).toBeNull();
    });
  });
});
