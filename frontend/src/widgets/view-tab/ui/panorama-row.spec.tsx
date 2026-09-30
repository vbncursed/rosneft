import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EXIT_PANORAMA, HIDDEN_NOTE, NOT_CALIBRATED, SHOW_IN } from "../model/copy";
import { PanoramaRow, type PanoramaRowView } from "./panorama-row";
import { hoverTip } from "@/shared/ui/tooltip/testing";

const ROW: PanoramaRowView = {
  id: 7,
  title: "Control room, north door",
  thumbUrl: "/api/assets/abc",
  active: false,
  calibrated: true,
  canEdit: false,
  editing: false,
  phase: "prior",
  hidden: false,
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
  it("shows the thumbnail at its own size, and does not pull it until it is looked at", () => {
    // A 256×128 JPEG the server made. The size attributes reserve the box's
    // ratio before the bytes land; lazy/async keep a list scrolled past off
    // the wire and off the main thread.
    const { container } = row();
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/api/assets/abc");
    expect(img).toHaveAttribute("width", "256");
    expect(img).toHaveAttribute("height", "128");
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");
  });

  it("falls back to the panorama glyph when the thumbnail is missing", () => {
    const { container } = row({ thumbUrl: null });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  // E8: a thumbnail that fails (404, a refused blob, offline) draws the glyph,
  // not the browser's broken-image mark.
  it("falls back to the panorama glyph when the thumbnail fails to load", () => {
    const { container } = row();
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  // E13: a photo off the network fades in over 150 ms instead of popping.
  it("fades a thumbnail in once its bytes land", () => {
    const { container } = row();
    const img = container.querySelector("img")!;
    expect(img).toHaveClass("opacity-0", "transition-opacity", "duration-150", "ease-out");
    fireEvent.load(img);
    expect(img).not.toHaveClass("opacity-0");
  });

  // …but one already in the cache is there from the first frame.
  it("shows a cached thumbnail at once, without the fade", () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    const { container } = row();
    expect(container.querySelector("img")).not.toHaveClass("opacity-0");
    complete.mockRestore();
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

  it("hides and shows itself with its own eye — an editor's only", async () => {
    const onHide = vi.fn();
    const { rerender } = row({ canEdit: true }, { onHide });
    const eye = screen.getByRole("button", { name: "Hide panorama Control room, north door" });
    expect(eye).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(eye);
    expect(onHide).toHaveBeenCalledWith(7, true);
    rerender(<PanoramaRow row={{ ...ROW, canEdit: false }} onEnter={vi.fn()} onExit={vi.fn()} onEdit={vi.fn()} onHide={onHide} />);
    expect(screen.queryByRole("button", { name: /^Hide panorama/ })).toBeNull();
  });

  it("moves to one of the other two phases", async () => {
    const onMove = vi.fn();
    row({ canEdit: true }, { onMove });
    await userEvent.click(screen.getByRole("button", { name: "Move Control room, north door to another phase" }));
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Current job", "Post job"]);
    await userEvent.click(screen.getByRole("menuitem", { name: "Post job" }));
    expect(onMove).toHaveBeenCalledWith(7, "post");
  });

  it("offers no move to a reader who cannot write", () => {
    row({ canEdit: false }, { onMove: vi.fn() });
    expect(screen.queryByRole("button", { name: /^Move/ })).toBeNull();
  });

  // D5: a row in a hidden phase dims like a hidden one, but its own eye keeps
  // its own flag — showing the phase again must not have to guess it. The
  // dimming itself is colour (not for a spec to assert); what a reader can
  // observe is the note and the control it is wired to.
  it("dims and says hidden when it or its phase is hidden, the eye keeping its own flag", () => {
    const { rerender } = row({ hidden: true });
    const note = screen.getByText(HIDDEN_NOTE);
    expect(note).toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: `${SHOW_IN}: Control room, north door` }).getAttribute("aria-describedby")).toBe(note.id);
    rerender(
      <PanoramaRow row={{ ...ROW, canEdit: true }} phaseHidden onEnter={vi.fn()} onExit={vi.fn()} onEdit={vi.fn()} onHide={vi.fn()} />,
    );
    const phaseNote = screen.getByText(HIDDEN_NOTE);
    expect(screen.getByRole("button", { name: `${SHOW_IN}: Control room, north door` }).getAttribute("aria-describedby")).toBe(phaseNote.id);
    expect(screen.getByRole("button", { name: /^Hide panorama/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("points at both the hidden note and the uncalibrated hint when both apply", () => {
    row({ hidden: true, calibrated: false });
    const describedBy = screen
      .getByRole("button", { name: `${SHOW_IN}: Control room, north door` })
      .getAttribute("aria-describedby")!
      .split(" ");
    expect(describedBy).toHaveLength(2);
    expect(screen.getByText(HIDDEN_NOTE).id).toBe(describedBy[0]);
    expect(screen.getByText(NOT_CALIBRATED).id).toBe(describedBy[1]);
    for (const id of describedBy) expect(document.getElementById(id)).not.toBeNull();
  });

  it("draws a shown row at full strength with no hidden note", () => {
    row();
    expect(screen.queryByText(HIDDEN_NOTE)).toBeNull();
    expect(screen.getByRole("button", { name: `${SHOW_IN}: Control room, north door` })).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("waits its eye and its moves while a write on it is in flight", async () => {
    row({ canEdit: true }, { pending: true, onHide: vi.fn(), onMove: vi.fn() });
    expect(screen.getByRole("button", { name: /^Hide panorama/ })).toHaveAttribute("aria-busy", "true");
    await userEvent.click(screen.getByRole("button", { name: /^Move/ }));
    for (const item of screen.getAllByRole("menuitem")) expect(item).toBeDisabled();
  });
});

describe("PanoramaRow · tooltip", () => {
  it("names its edit button in a tooltip, not a native title", () => {
    row({ canEdit: true });
    const edit = screen.getByRole("button", { name: "Edit Control room, north door" });
    expect(edit).not.toHaveAttribute("title");
    expect(hoverTip(edit)).toHaveTextContent("Edit Control room, north door");
  });
});
