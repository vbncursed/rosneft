import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SelectedBlock, type SelectedBlockProps } from "./selected-block";

const TRANSFORM = {
  position: { x: 12.4, y: 0, z: -8.25 },
  rotation: { x: 0, y: Math.PI / 2, z: 0 },
  scale: { x: 1, y: 1, z: 1 },
};

const base: SelectedBlockProps = {
  name: "storage-tank-500 #2",
  gizmo: "translate",
  onGizmo: vi.fn(),
  transform: TRANSFORM,
  snap: true,
  onSnap: vi.fn(),
  canWrite: true,
  form: null,
  compact: false,
};

const form = {
  kind: "new" as const,
  label: "",
  onLabel: vi.fn(),
  transform: TRANSFORM,
  onTransform: vi.fn(),
  saving: false,
  onSave: vi.fn(),
  onCancel: vi.fn(),
};

describe("SelectedBlock", () => {
  it("shows the transform in degrees and lets the gizmo mode change", async () => {
    const onGizmo = vi.fn();
    render(<SelectedBlock {...base} onGizmo={onGizmo} />);
    expect(screen.getByText("storage-tank-500 #2")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Pos" })).toHaveTextContent("12.400");
    expect(screen.getByRole("group", { name: "Rot" })).toHaveTextContent("90°");
    await userEvent.click(screen.getByRole("radio", { name: "Scale (S)" }));
    expect(onGizmo).toHaveBeenCalledWith("scale");
    expect(screen.getByRole("switch", { name: "Snap to surface" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("drops the key parentheses when compact", () => {
    render(<SelectedBlock {...base} compact />);
    expect(screen.getByRole("radio", { name: "Translate T" })).toBeInTheDocument();
  });

  it("without the write grant the block is read-only: no segmented control, no switch", () => {
    render(<SelectedBlock {...base} canWrite={false} />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByRole("group", { name: "Scl" })).toHaveTextContent("1.000");
  });

  it("the create form edits the label and the numbers, and saves", async () => {
    const onSave = vi.fn();
    const onLabel = vi.fn();
    const onTransform = vi.fn();
    render(<SelectedBlock {...base} form={{ ...form, onLabel, onSave, onTransform }} />);
    expect(screen.getByText("Selected · new")).toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Label" }), "T");
    expect(onLabel).toHaveBeenCalledWith("T");
    // The form's rotation boxes carry bare degrees and report radians back.
    expect(screen.getByLabelText("Rot y")).toHaveValue("90");
    await userEvent.clear(screen.getByLabelText("Rot y"));
    await userEvent.type(screen.getByLabelText("Rot y"), "180");
    expect(onTransform).toHaveBeenLastCalledWith(
      expect.objectContaining({ rotation: { x: 0, y: Math.PI, z: 0 } }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("reports a new transform for the position and scale boxes too", async () => {
    const onTransform = vi.fn();
    render(<SelectedBlock {...base} form={{ ...form, onTransform }} />);
    await userEvent.type(screen.getByLabelText("Pos y"), "5");
    expect(onTransform).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: { x: 12.4, y: 5, z: -8.25 } }),
    );
    await userEvent.type(screen.getByLabelText("Scl x"), "2");
    expect(onTransform).toHaveBeenLastCalledWith(
      expect.objectContaining({ scale: { x: 12, y: 1, z: 1 } }),
    );
  });

  it("an edit form takes the numbers too, under a plain overline", async () => {
    // Save sends what was typed here, so the cells take typing exactly as the
    // create form's do; only the word for what is happening differs.
    const onTransform = vi.fn();
    render(
      <SelectedBlock {...base} form={{ ...form, kind: "edit", label: "Tank 4", onTransform }} />,
    );
    expect(screen.getByText("Selected")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveValue("Tank 4");
    await userEvent.type(screen.getByLabelText("Pos y"), "5");
    expect(onTransform).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: { x: 12.4, y: 5, z: -8.25 } }),
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("keeps the snap switch on screen under an open form, and under a saving one", () => {
    const { rerender } = render(<SelectedBlock {...base} form={form} />);
    expect(screen.getByRole("switch", { name: "Snap to surface" })).toBeInTheDocument();
    rerender(<SelectedBlock {...base} form={{ ...form, saving: true }} />);
    expect(screen.getByRole("switch", { name: "Snap to surface" })).toBeInTheDocument();
  });

  it("the saving form is busy and its fields wait", () => {
    render(<SelectedBlock {...base} form={{ ...form, saving: true }} />);
    expect(screen.getByText("Selected · saving")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Saving/ })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("textbox", { name: "Label" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
    // A cell that takes typing during a PUT invites an edit the response is
    // about to overwrite: they report while one is in flight.
    expect(screen.queryByLabelText("Pos x")).toBeNull();
    expect(screen.getByRole("group", { name: "Pos" })).toHaveTextContent("12.400");
  });

  it("cancels the form", async () => {
    const onCancel = vi.fn();
    render(<SelectedBlock {...base} form={{ ...form, onCancel }} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("flips the snap switch", async () => {
    const onSnap = vi.fn();
    render(<SelectedBlock {...base} snap={false} onSnap={onSnap} />);
    await userEvent.click(screen.getByRole("switch", { name: "Snap to surface" }));
    expect(onSnap).toHaveBeenCalledWith(true);
  });
});
