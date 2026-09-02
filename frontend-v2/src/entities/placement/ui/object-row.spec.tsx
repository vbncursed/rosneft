import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ObjectRow } from "./object-row";
import type { Placement } from "../model/placement";

const PLACEMENT: Placement = {
  id: 7,
  territorySlug: "refinery-block-c",
  modelSlug: "pump-jack",
  label: "Pump Jack Unit",
  updatedAt: "2026-08-31T14:02:00Z",
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  visiblePanoramaIds: [],
};

const row = (over: Partial<React.ComponentProps<typeof ObjectRow>> = {}) => {
  const props = {
    placement: PLACEMENT,
    selected: false,
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  };
  render(<ObjectRow {...props} />);
  return props;
};

describe("ObjectRow", () => {
  it("names the object and reports its selection state", () => {
    row({ selected: true });
    const name = screen.getByRole("button", { name: "Pump Jack Unit" });
    expect(name).toHaveAttribute("aria-pressed", "true");
    expect(name.className).toContain("text-accent");
  });

  it("selects on click and deselects on a second click", async () => {
    const { onSelect } = row();
    await userEvent.click(screen.getByRole("button", { name: "Pump Jack Unit" }));
    expect(onSelect).toHaveBeenCalledWith(7);
  });

  it("deselects when the selected row is clicked again", async () => {
    const { onSelect } = row({ selected: true });
    await userEvent.click(screen.getByRole("button", { name: "Pump Jack Unit" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("renames through the pencil, committing on Enter", async () => {
    const { onRename } = row();
    await userEvent.click(screen.getByRole("button", { name: "Rename Pump Jack Unit" }));

    const input = screen.getByRole("textbox", { name: "Rename Pump Jack Unit" });
    await userEvent.clear(input);
    await userEvent.type(input, "Pump Jack A2{Enter}");
    expect(onRename).toHaveBeenCalledWith(7, "Pump Jack A2");
  });

  it("abandons a rename on Escape", async () => {
    const { onRename } = row();
    await userEvent.click(screen.getByRole("button", { name: "Rename Pump Jack Unit" }));
    await userEvent.type(screen.getByRole("textbox"), "junk{Escape}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pump Jack Unit" })).toBeInTheDocument();
  });

  it("does not report a rename that changed nothing", async () => {
    const { onRename } = row();
    await userEvent.click(screen.getByRole("button", { name: "Rename Pump Jack Unit" }));
    await userEvent.tab();
    expect(onRename).not.toHaveBeenCalled();
  });

  it("refuses to rename an object to nothing", async () => {
    const { onRename } = row();
    await userEvent.click(screen.getByRole("button", { name: "Rename Pump Jack Unit" }));
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.tab();
    expect(onRename).not.toHaveBeenCalled();
  });

  it("deletes through the trash", async () => {
    const { onDelete } = row();
    await userEvent.click(screen.getByRole("button", { name: "Delete Pump Jack Unit" }));
    expect(onDelete).toHaveBeenCalledWith(7);
  });

  it("hides the write and delete controls the caller is not allowed", () => {
    row({ canWrite: false, canDelete: false });
    expect(screen.queryByRole("button", { name: /Rename/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete/ })).not.toBeInTheDocument();
  });

  it("offers the panorama checkbox only while a panorama is open", async () => {
    const onToggleVisible = vi.fn();
    const { unmount } = render(
      <ObjectRow
        placement={PLACEMENT}
        selected={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    unmount();

    render(
      <ObjectRow
        placement={PLACEMENT}
        selected={false}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        visibleInPanorama={false}
        onToggleVisible={onToggleVisible}
      />,
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Show Pump Jack Unit in this panorama" }),
    );
    expect(onToggleVisible).toHaveBeenCalledWith(7, true);
  });

  it("freezes its controls while a mutation is in flight", () => {
    row({ pending: true });
    expect(screen.getByRole("button", { name: /Rename/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Delete/ })).toBeDisabled();
  });
});
