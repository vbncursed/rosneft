import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OPTIONS, ZONE } from "./zone-options.fixture";
import { ZonePanel, type ZonePanelProps } from "./zone-panel";

const panel = (over: Partial<ZonePanelProps> = {}) => (
  <ZonePanel
    zone={ZONE}
    sizeLine={{ text: "Drawing 10.0 × 5.0 m · Model 10.0 × 5.0 m (0 %)", warn: false }}
    inside={3}
    options={OPTIONS}
    canPlace
    onPlace={vi.fn()}
    onWholeLibrary={vi.fn()}
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

  it("lists only the models that carry one of the zone's tags", () => {
    render(panel());
    const list = screen.getByRole("list", { name: "Equipment" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("storage-tank-500"), expect.stringContaining("transfer-pump")]),
    );
    expect(within(list).queryByText("overhead-crane")).toBeNull();
    expect(within(list).queryByText("loose-barrel")).toBeNull();
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });

  it("places the model with the chosen count, once", async () => {
    const onPlace = vi.fn();
    render(panel({ onPlace }));
    await userEvent.click(screen.getByRole("button", { name: "Increase count of storage-tank-500" }));
    await userEvent.click(screen.getByRole("button", { name: "Place storage-tank-500" }));
    expect(onPlace).toHaveBeenCalledOnce();
    expect(onPlace).toHaveBeenCalledWith("tank-500", 2);
  });

  it("offers no Place buttons without placement:create", () => {
    render(panel({ canPlace: false }));
    expect(screen.queryByRole("button", { name: /^Place / })).toBeNull();
    expect(screen.getByText("storage-tank-500")).toBeInTheDocument();
  });

  it("explains an empty list and offers the whole library", async () => {
    const onWholeLibrary = vi.fn();
    render(panel({ options: [OPTIONS[2]], onWholeLibrary }));
    expect(screen.getByText("No catalog models carry this zone's tags.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Equipment" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Whole library…" }));
    expect(onWholeLibrary).toHaveBeenCalledOnce();
  });

  it("does not offer the whole library to a reader who cannot place", () => {
    render(panel({ options: [], canPlace: false }));
    expect(screen.getByText("No catalog models carry this zone's tags.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Whole library…" })).toBeNull();
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
