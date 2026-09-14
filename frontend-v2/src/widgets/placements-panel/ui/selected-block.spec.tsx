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

  it("the rename form edits the label alone — the numbers only report", () => {
    // `save` sends a rename for this kind, so a typed number was accepted and
    // then discarded. The cells print, they do not take.
    render(<SelectedBlock {...base} form={{ ...form, kind: "rename", label: "Tank 4" }} />);
    expect(screen.getByText("Selected · rename")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Label" })).toHaveValue("Tank 4");
    expect(screen.queryByLabelText("Pos x")).toBeNull();
    expect(screen.queryByLabelText("Rot y")).toBeNull();
    expect(screen.queryByLabelText("Scl x")).toBeNull();
    expect(screen.getByRole("group", { name: "Pos" })).toHaveTextContent("12.400");
    // Still degrees, as everywhere else the numbers are printed.
    expect(screen.getByRole("group", { name: "Rot" })).toHaveTextContent("90°");
  });

  it("the saving form is busy and its fields wait", () => {
    render(<SelectedBlock {...base} form={{ ...form, saving: true }} />);
    expect(screen.getByText("Selected · saving")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Saving/ })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("textbox", { name: "Label" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
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
