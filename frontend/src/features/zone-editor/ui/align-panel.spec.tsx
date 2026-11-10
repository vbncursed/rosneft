import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { alignmentStub } from "./alignment.fixture";
import { AlignPanel, type AlignPanelProps } from "./align-panel";

const editor = (over: Partial<AlignPanelProps["editor"]> = {}, a: Parameters<typeof alignmentStub>[0] = {}) =>
  ({
    status: "ready",
    page: 1,
    pageCount: 1,
    setPage: vi.fn(),
    placing: false,
    setPlacing: vi.fn(),
    alignment: alignmentStub(a),
    ...over,
  }) as AlignPanelProps["editor"];

describe("AlignPanel", () => {
  it("offers a way back to placing pairs once the rectangles are being picked, and only then", async () => {
    const setPlacing = vi.fn();
    const { rerender } = render(<AlignPanel editor={editor({ placing: false, setPlacing })} />);
    await userEvent.click(screen.getByRole("button", { name: "Add a point pair" }));
    expect(setPlacing).toHaveBeenCalledWith(true);

    rerender(<AlignPanel editor={editor({ placing: true, setPlacing })} />);
    expect(screen.queryByRole("button", { name: "Add a point pair" })).toBeNull();
  });

  it("shows no page picker for a single-page plan", () => {
    render(<AlignPanel editor={editor()} />);
    expect(screen.queryByRole("combobox", { name: "Page" })).not.toBeInTheDocument();
  });

  it("offers a page picker for a multi-page plan", async () => {
    const setPage = vi.fn();
    render(<AlignPanel editor={editor({ pageCount: 3, setPage })} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Page" }), "2");
    expect(setPage).toHaveBeenCalledWith(2);
  });

  it("lists each pair with its residual in metres and removes one", async () => {
    const removePair = vi.fn();
    render(
      <AlignPanel
        editor={editor(
          {},
          {
            pairs: [{}, {}] as never,
            residualsM: [0.4, 1.256],
            removePair,
            scaleLine: "Model matches the drawing scale",
          },
        )}
      />,
    );
    expect(screen.getByText("0.40 m off")).toBeInTheDocument();
    expect(screen.getByText("1.26 m off")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove pair 2" }));
    expect(removePair).toHaveBeenCalledWith(1);
  });

  it("says the fit is exact with two points", () => {
    render(<AlignPanel editor={editor({}, { fitLine: "Exact fit with two points" })} />);
    expect(screen.getByText("Exact fit with two points")).toBeInTheDocument();
  });

  it("says why the plan is not placed automatically", () => {
    render(
      <AlignPanel
        editor={editor(
          {},
          {
            notice:
              "This plan's survey coordinates do not fall on this model, so it cannot be aligned automatically. Add point pairs by hand — sizes are still checked against the drawing's own scale.",
          },
        )}
      />,
    );
    expect(
      screen.getByText(
        "This plan's survey coordinates do not fall on this model, so it cannot be aligned automatically. Add point pairs by hand — sizes are still checked against the drawing's own scale.",
      ),
    ).toBeInTheDocument();
  });

  it("asks for the model click while a plan point waits, and can cancel it", async () => {
    const cancelPending = vi.fn();
    render(<AlignPanel editor={editor({}, { awaitingScenePick: true, cancelPending })} />);
    expect(screen.getByText("Now click the same spot on the model.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel this point" }));
    expect(cancelPending).toHaveBeenCalledOnce();
  });

  it("prints a mirrored fit's reason as an alert and disables Save", () => {
    render(
      <AlignPanel
        editor={editor(
          {},
          {
            fit: { ok: false, reason: "mirrored", message: "These points are mirrored relative to the model." },
            error: "These points are mirrored relative to the model.",
            canSave: false,
          },
        )}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("These points are mirrored relative to the model.");
    expect(screen.getByRole("button", { name: "Save alignment" })).toBeDisabled();
  });

  it("shows 'add two pairs' as a plain hint, not an alert", () => {
    render(
      <AlignPanel
        editor={editor(
          {},
          {
            fit: { ok: false, reason: "too-few", message: "Add at least two point pairs." },
            error: "Add at least two point pairs.",
          },
        )}
      />,
    );
    expect(screen.getByText("Add at least two point pairs.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("states the scale difference in words, and a large one as a warning", () => {
    const { rerender } = render(
      <AlignPanel editor={editor({}, { scaleLine: "Model is 1.2 % larger than the drawing", scaleWarn: false })} />,
    );
    expect(screen.getByText("Model is 1.2 % larger than the drawing")).toBeInTheDocument();
    rerender(
      <AlignPanel
        editor={editor(
          {},
          { scaleLine: "Model is 4.0 % larger than the drawing. Check that the points match.", scaleWarn: true },
        )}
      />,
    );
    expect(screen.getByText(/Check that the points match/)).toBeInTheDocument();
  });

  it("requires confirmation before saving a scale mismatch", async () => {
    const save = vi.fn();
    render(<AlignPanel editor={editor({}, { canSave: true, scaleWarn: true, save })} />);
    await userEvent.click(screen.getByRole("button", { name: "Save alignment" }));
    expect(save).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Confirm save" }));
    expect(save).toHaveBeenCalledOnce();
  });

  it("cancels confirmation and forgets it when pairs change", async () => {
    const save = vi.fn();
    const pairs = [{}] as never;
    const { rerender } = render(<AlignPanel editor={editor({}, { canSave: true, scaleWarn: true, pairs, save })} />);
    await userEvent.click(screen.getByRole("button", { name: "Save alignment" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(save).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Save alignment" }));
    rerender(<AlignPanel editor={editor({}, { canSave: true, scaleWarn: true, pairs: [{}] as never, save })} />);
    expect(screen.getByRole("button", { name: "Save alignment" })).toBeInTheDocument();
  });

  it("shows and toggles named PDF layers", async () => {
    const toggleLayer = vi.fn();
    render(<AlignPanel editor={editor({ layers: [{ id: "a", name: "Walls", visible: false }], toggleLayer })} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Walls" }));
    expect(toggleLayer).toHaveBeenCalledWith("a");
  });

  it("disables save while the current page is loading", () => {
    render(<AlignPanel editor={editor({ status: "loading" }, { canSave: true, scaleWarn: false })} />);
    expect(screen.getByRole("button", { name: "Save alignment" })).toBeDisabled();
  });

  it("requires a new confirmation when the page changes even if the pairs are identical", async () => {
    const pairs = [{}] as never;
    const { rerender } = render(<AlignPanel editor={editor({ page: 1 }, { pairs, canSave: true, scaleWarn: true })} />);
    await userEvent.click(screen.getByRole("button", { name: "Save alignment" }));
    rerender(<AlignPanel editor={editor({ page: 2 }, { pairs, canSave: true, scaleWarn: true })} />);
    expect(screen.getByRole("button", { name: "Save alignment" })).toBeInTheDocument();
  });

  it("saves and clears", async () => {
    const [save, clear] = [vi.fn(), vi.fn()];
    render(<AlignPanel editor={editor({}, { canSave: true, save, clear })} />);
    await userEvent.click(screen.getByRole("button", { name: "Save alignment" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear alignment" }));
    expect(save).toHaveBeenCalledOnce();
    expect(clear).toHaveBeenCalledOnce();
  });

  it("reads 'loading' and 'unreadable' differently", () => {
    const { rerender } = render(<AlignPanel editor={editor({ status: "loading" })} />);
    expect(screen.getByText("Reading the plan…")).toBeInTheDocument();
    rerender(<AlignPanel editor={editor({ status: "error" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("The plan could not be read");
  });
});

describe("AlignPanel tour anchors", () => {
  it("anchors the pair flow and the save row, and keeps the anchor while a point waits", () => {
    const { container, rerender } = render(<AlignPanel editor={editor()} />);
    const pair = container.querySelector('[data-tour="plan-add-pair"]')!;
    expect(pair).toContainElement(screen.getByRole("button", { name: "Add a point pair" }));
    expect(container.querySelector('[data-tour="plan-save"]')).toContainElement(
      screen.getByRole("button", { name: "Save alignment" }),
    );
    rerender(<AlignPanel editor={editor({}, { awaitingScenePick: true })} />);
    expect(container.querySelector('[data-tour="plan-add-pair"]')).toHaveTextContent("Now click the same spot");
  });
});
