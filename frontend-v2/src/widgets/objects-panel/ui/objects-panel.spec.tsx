import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ObjectsPanel } from "./objects-panel";
import type { Placement } from "@/entities/placement";

const make = (id: number, label: string, visiblePanoramaIds: number[] = []): Placement => ({
  id,
  territorySlug: "refinery-block-c",
  modelSlug: "pump-jack",
  label,
  updatedAt: "2026-08-31T14:02:00Z",
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
  visiblePanoramaIds,
});

const PLACEMENTS = [make(1, "Pump Jack Unit", [4]), make(2, "Storage Tank 500")];

const handlers = { onSelect: vi.fn(), onRename: vi.fn(), onDelete: vi.fn() };

describe("ObjectsPanel", () => {
  it("lists one row per placement", () => {
    render(<ObjectsPanel placements={PLACEMENTS} selectedId={null} {...handlers} />);
    expect(screen.getByRole("list", { name: "Objects" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("invites an upload rather than showing an empty list", () => {
    render(<ObjectsPanel placements={[]} selectedId={null} {...handlers} />);
    expect(screen.getByText("No objects on this territory yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("marks the selected row", () => {
    render(<ObjectsPanel placements={PLACEMENTS} selectedId={2} {...handlers} />);
    expect(screen.getByRole("button", { name: "Storage Tank 500" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows no visibility box outside a panorama", () => {
    render(<ObjectsPanel placements={PLACEMENTS} selectedId={null} {...handlers} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("checks the boxes for placements visible in the open panorama", () => {
    render(
      <ObjectsPanel
        placements={PLACEMENTS}
        selectedId={null}
        activePanoramaId={4}
        onToggleVisible={vi.fn()}
        {...handlers}
      />,
    );
    expect(
      screen.getByRole("checkbox", { name: "Show Pump Jack Unit in this panorama" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Show Storage Tank 500 in this panorama" }),
    ).not.toBeChecked();
  });

  it("marks only the pending rows as busy", () => {
    render(
      <ObjectsPanel placements={PLACEMENTS} selectedId={null} pendingIds={[1]} {...handlers} />,
    );
    expect(screen.getByRole("button", { name: "Delete Pump Jack Unit" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete Storage Tank 500" })).toBeEnabled();
  });

  it("passes the permission flags down to every row", () => {
    render(
      <ObjectsPanel
        placements={PLACEMENTS}
        selectedId={null}
        canDelete={false}
        {...handlers}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Rename/ })).toHaveLength(2);
  });

  it("selects through the panel", async () => {
    const onSelect = vi.fn();
    render(
      <ObjectsPanel placements={PLACEMENTS} selectedId={null} {...handlers} onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Pump Jack Unit" }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
