import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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

  it("says so in words for a model that has not been converted", () => {
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
    // "0 LODs · 0.0 MB" says nothing; no line at all left that one card ~14px
    // short of its neighbours in a grid whose tiles must match.
    expect(screen.queryByText(/0 LODs/)).not.toBeInTheDocument();
    expect(screen.getByText("Not converted yet")).toBeInTheDocument();
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
    // The button reads `Place` whatever is picked: the count is in the stepper
    // beside it and the model on the card above, so the long name only made the
    // footer jump as the reader chose.
    await userEvent.click(screen.getByRole("button", { name: "Place" }));

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
        placing={{ done: 0, total: 2 }}
        onPlace={vi.fn()}
      />,
    );

    // Nothing has landed yet and the first POST is in flight: the line names
    // the object being placed, never "0 of 2".
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

  it("keeps the primary reading `Place` once a model is picked", async () => {
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

    await userEvent.click(screen.getByRole("button", { name: /storage-tank-500/ }));
    expect(screen.getByRole("button", { name: "Place" })).toBeEnabled();
    expect(screen.queryByText(/× storage-tank-500/)).not.toBeInTheDocument();
  });

  it("forgets the query, the selection and the count on a reopen", async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Reopen
          </button>
          <PlaceObjectsModal
            open={open}
            onClose={() => setOpen(false)}
            territoryTitle="T"
            options={options}
            placing={null}
            onPlace={vi.fn()}
          />
        </>
      );
    }
    render(<Harness />);

    await userEvent.type(screen.getByLabelText("Search the model library"), "tank");
    await userEvent.click(screen.getByRole("button", { name: /storage-tank-500/ }));
    await userEvent.click(
      screen.getByRole("button", { name: "Increase storage-tank-500 quantity" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Reopen" }));

    expect(screen.getByLabelText("Search the model library")).toHaveValue("");
    expect(screen.getByRole("button", { name: /storage-tank-500/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /not-yet/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place" })).toBeDisabled();
  });

  it("says a query matching nothing found nothing, not that the library is empty", async () => {
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

    await userEvent.type(screen.getByLabelText("Search the model library"), "zzz");

    expect(screen.getByText("Nothing matches your search.")).toBeInTheDocument();
    expect(screen.queryByText("No models in the library yet.")).not.toBeInTheDocument();
  });

  it("counts one LOD in the singular", () => {
    render(
      <PlaceObjectsModal
        open
        onClose={vi.fn()}
        territoryTitle="T"
        options={[{ slug: "one", title: "single", chain: [{ lod: 0, hash: "a", size: 1_048_576 }] }]}
        placing={null}
        onPlace={vi.fn()}
      />,
    );
    expect(screen.getByText("1 LOD · 1.0 MB")).toBeInTheDocument();
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
