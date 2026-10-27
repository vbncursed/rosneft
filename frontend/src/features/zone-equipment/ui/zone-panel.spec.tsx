import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ZONE } from "./zone-options.fixture";
import { ZonePanel, type ZonePanelProps } from "./zone-panel";

const panel = (over: Partial<ZonePanelProps> = {}) => (
  <ZonePanel
    zone={ZONE}
    sizeLine={{ text: "Drawing 10.0 × 5.0 m · Model 10.0 × 5.0 m (0 %)", warn: false }}
    inside={3}
    onAddObjects={vi.fn()}
    onClose={vi.fn()}
    {...over}
  />
);

describe("ZonePanel", () => {
  it("names the zone, its tags, its size check and what stands inside", () => {
    render(panel());
    expect(screen.getByRole("heading", { name: "Tank row" })).toBeInTheDocument();
    expect(screen.getByText("Tanks")).toBeInTheDocument();
    expect(screen.getByText("Pumps")).toBeInTheDocument();
    expect(screen.getByText(/Drawing 10.0 × 5.0 m/)).toBeInTheDocument();
    expect(screen.getByText("3 placements inside")).toBeInTheDocument();
  });

  it("says 'placement' for one, and leaves the size line out when there is none", () => {
    render(panel({ inside: 1, sizeLine: null }));
    expect(screen.getByText("1 placement inside")).toBeInTheDocument();
    expect(screen.queryByText(/Drawing/)).toBeNull();
  });

  it("carries no equipment list of its own: the model list is the picker's, opened from the zone", () => {
    render(panel());
    expect(screen.queryByRole("list", { name: "Equipment" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Place / })).toBeNull();
    expect(screen.queryByRole("button", { name: "Whole library…" })).toBeNull();
  });

  it("reopens the filtered model list from Add objects, once", async () => {
    const onAddObjects = vi.fn();
    render(panel({ onAddObjects }));
    await userEvent.click(screen.getByRole("button", { name: "Add objects" }));
    expect(onAddObjects).toHaveBeenCalledOnce();
  });

  it("offers no Add objects without placement:create", () => {
    render(panel({ onAddObjects: undefined }));
    expect(screen.queryByRole("button", { name: "Add objects" })).toBeNull();
    expect(screen.getByText("3 placements inside")).toBeInTheDocument();
  });

  it("prints a size warning as it is worded", () => {
    render(panel({ sizeLine: { text: "Drawing 10.0 × 5.0 m · differs by more than 3 %", warn: true } }));
    expect(screen.getByText(/differs by more than 3 %/)).toBeInTheDocument();
  });

  it("deletes only after the question is answered, and edits straight away", async () => {
    const onDelete = vi.fn();
    const onEdit = vi.fn();
    render(panel({ onDelete, onEdit }));
    await userEvent.click(screen.getByRole("button", { name: "Edit zones" }));
    expect(onEdit).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: "Delete Tank row" }));
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("closes from its own button", async () => {
    const onClose = vi.fn();
    render(panel({ onClose }));
    await userEvent.click(screen.getByRole("button", { name: "Close Tank row" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows neither without the handlers", () => {
    render(panel());
    expect(screen.queryByRole("button", { name: "Edit zones" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Tank row" })).toBeNull();
  });
});

describe("ZonePanel tour anchors", () => {
  it("anchors the card and Add objects", () => {
    render(panel());
    expect(screen.getByRole("region", { name: "Zone Tank row" })).toHaveAttribute("data-tour", "zone-card");
    expect(screen.getByRole("button", { name: "Add objects" })).toHaveAttribute("data-tour", "zone-place");
  });

  it("draws no Add objects anchor without placement:create, so the step skips itself", () => {
    const { container } = render(panel({ onAddObjects: undefined }));
    expect(container.querySelector('[data-tour="zone-place"]')).toBeNull();
  });
});
