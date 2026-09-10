import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ModelOption } from "@/entities/scene";
import { PlaceObjectsModal } from "./place-objects-modal";

const options: ModelOption[] = [
  {
    slug: "tank",
    title: "storage-tank-500",
    chain: [
      { lod: 0, hash: "a", size: 8_400_000 },
      { lod: 1, hash: "b", size: 1 },
      { lod: 2, hash: "c", size: 1 },
    ],
  },
  { slug: "raw", title: "not-yet", chain: [] },
];

describe("PlaceObjectsModal", () => {
  it("names the territory, lists the library with LOD counts, and greys the unconverted", () => {
    render(
      <PlaceObjectsModal
        open
        onClose={vi.fn()}
        territoryTitle="Refinery Block C"
        options={options}
        placing={null}
        onPlace={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Add objects to Refinery Block C" }),
    ).toBeInTheDocument();
    // Binary MB to one decimal — the app's own formatBytes rounds 8_400_002 to
    // a flat "8 MB", which loses the difference between two LOD chains.
    expect(screen.getByText("3 LODs · 8.0 MB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /not-yet/ })).toBeDisabled();
  });

  it("prints no size line for a model that has not been converted", () => {
    render(
      <PlaceObjectsModal
        open
        onClose={vi.fn()}
        territoryTitle="T"
        options={options}
        placing={null}
        onPlace={vi.fn()}
      />,
    );
    // "0 LODs · 0.0 MB" under a card already marked "· n/a" says nothing.
    expect(screen.queryByText(/0 LODs/)).not.toBeInTheDocument();
  });

  it("places N of the chosen model", async () => {
    const onPlace = vi.fn();
    render(
      <PlaceObjectsModal
        open
        onClose={vi.fn()}
        territoryTitle="T"
        options={options}
        placing={null}
        onPlace={onPlace}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /storage-tank-500/ }));
    await userEvent.click(
      screen.getByRole("button", { name: "Increase storage-tank-500 quantity" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Place 2 × storage-tank-500" }));

    expect(onPlace).toHaveBeenCalledWith("tank", 2);
  });

  it("filters the library by the search", async () => {
    render(
      <PlaceObjectsModal
        open
        onClose={vi.fn()}
        territoryTitle="T"
        options={options}
        placing={null}
        onPlace={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText("Search the model library"), "tank");

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /storage-tank-500/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /not-yet/ })).not.toBeInTheDocument();
  });

  it("shows the placing line and keeps the primary busy", () => {
    render(
      <PlaceObjectsModal
        open
        onClose={vi.fn()}
        territoryTitle="T"
        options={options}
        placing={{ done: 1, total: 2 }}
        onPlace={vi.fn()}
      />,
    );

    expect(screen.getByText("Placing 1 of 2…")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Placing" })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
    expect(screen.getByRole("button", { name: "Place" })).toHaveAttribute("aria-busy", "true");
  });

  it("cannot place with nothing selected", () => {
    const onPlace = vi.fn();
    render(
      <PlaceObjectsModal
        open
        onClose={vi.fn()}
        territoryTitle="T"
        options={options}
        placing={null}
        onPlace={onPlace}
      />,
    );

    const place = screen.getByRole("button", { name: "Place" });
    expect(place).toBeDisabled();
    expect(screen.queryByText(/Place 1 ×/)).not.toBeInTheDocument();
  });

  it("closes without placing anything", async () => {
    const onClose = vi.fn();
    const onPlace = vi.fn();
    render(
      <PlaceObjectsModal
        open
        onClose={onClose}
        territoryTitle="T"
        options={options}
        placing={null}
        onPlace={onPlace}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /storage-tank-500/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onPlace).not.toHaveBeenCalled();
  });
});
