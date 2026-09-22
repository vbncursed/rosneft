import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EXIT_PANORAMA, NOT_CALIBRATED, SHOW_IN } from "../model/copy";
import { PanoramaRow, type PanoramaRowView } from "./panorama-row";

const ROW: PanoramaRowView = {
  id: 7,
  title: "Control room, north door",
  thumbUrl: "/api/assets/abc",
  active: false,
  calibrated: true,
  canEdit: false,
  editing: false,
};

const row = (over: Partial<PanoramaRowView> = {}, handlers: Partial<Parameters<typeof PanoramaRow>[0]> = {}) =>
  render(
    <PanoramaRow
      row={{ ...ROW, ...over }}
      onEnter={vi.fn()}
      onExit={vi.fn()}
      onEdit={vi.fn()}
      {...handlers}
    />,
  );

describe("PanoramaRow", () => {
  it("shows the photo when there is one, and does not pull it until it is looked at", () => {
    // The thumb is the whole equirect — 5-8 MB and a 32 MB decode per capture,
    // on a tab that opens by default.
    const { container } = row();
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/api/assets/abc");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
  });

  it("falls back to the panorama glyph when the thumbnail is missing", () => {
    const { container } = row({ thumbUrl: null });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("says a panorama is not calibrated yet and still offers the way in", async () => {
    // The anchor at the origin is a place to stand, and the alignment has to
    // be judged from inside — so the hint warns, it does not lock the door.
    const onEnter = vi.fn();
    row({ calibrated: false }, { onEnter });
    const hint = screen.getByText(NOT_CALIBRATED);
    const enter = screen.getByRole("button", { name: `${SHOW_IN}: Control room, north door` });
    expect(hint.compareDocumentPosition(enter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Sighted readers get the warning from proximity; a screen reader gets it
    // only if the button points at it.
    expect(enter.getAttribute("aria-describedby")).toBe(hint.id);
    expect(hint.id).not.toBe("");
    await userEvent.click(enter);
    expect(onEnter).toHaveBeenCalledWith(7);
  });

  it("points at no hint once the anchor is calibrated", () => {
    row();
    expect(
      screen.getByRole("button", { name: /Show in this panorama/ }).getAttribute("aria-describedby"),
    ).toBeNull();
  });

  it("enters a calibrated panorama by id", async () => {
    const onEnter = vi.fn();
    row({}, { onEnter });
    await userEvent.click(screen.getByRole("button", { name: /Show in this panorama/ }));
    expect(onEnter).toHaveBeenCalledWith(7);
  });

  it("names the enter button after its panorama, so two rows differ to a reader", () => {
    row();
    expect(
      screen.getByRole("button", { name: `${SHOW_IN}: Control room, north door` }),
    ).toBeInTheDocument();
  });

  it("offers the way out of the active row, on the accent ground", async () => {
    const onExit = vi.fn();
    const { container } = row({ active: true }, { onExit });
    await userEvent.click(screen.getByRole("button", { name: `${EXIT_PANORAMA}: Control room, north door` }));
    expect(onExit).toHaveBeenCalled();
    expect(container.firstElementChild?.className).toContain("bg-accent-soft");
  });

  it("draws the pencil only for a writer, and marks the row being edited", async () => {
    const onEdit = vi.fn();
    const { container } = row({ canEdit: false });
    expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveAttribute("aria-current");

    const edit = row({ canEdit: true, editing: true }, { onEdit });
    await userEvent.click(screen.getByRole("button", { name: "Edit Control room, north door" }));
    expect(onEdit).toHaveBeenCalledWith(7);
    expect(edit.container.firstElementChild).toHaveAttribute("aria-current", "true");
  });

  it("presses the row's buttons", () => {
    row({ canEdit: true });
    expect(screen.getByRole("button", { name: `Edit ${ROW.title}` })).toHaveClass("active:scale-95", "ease-out");
    for (const b of screen.getAllByRole("button")) expect(b.className).toMatch(/active:scale-/);
  });
});

/** A mouse resting on the control for the tooltip's 500 ms; returns what opened. */
function hoverTip(el: Element) {
  vi.useFakeTimers();
  fireEvent.pointerEnter(el, { pointerType: "mouse" });
  act(() => vi.advanceTimersByTime(500));
  vi.useRealTimers();
  return screen.queryByRole("tooltip");
}

describe("PanoramaRow · tooltip", () => {
  it("names its edit button in a tooltip, not a native title", () => {
    row({ canEdit: true });
    const edit = screen.getByRole("button", { name: "Edit Control room, north door" });
    expect(edit).not.toHaveAttribute("title");
    expect(hoverTip(edit)).toHaveTextContent("Edit Control room, north door");
  });
});
