import { render, screen, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Panorama } from "@/entities/panorama";
import type { Vec3 } from "@/entities/placement";
import {
  CALIBRATE,
  CLOSE_EDITOR,
  DELETE_PANORAMA,
  ENTER_PANORAMA_VIEW,
  EXIT,
  IMAGE_FAILED,
  OPACITY_LABEL,
  SAVE,
  SAVE_ANCHOR,
  SET_DEFAULT_VIEW,
  SET_FROM_CAMERA,
  SWITCH_TO_3D,
  TITLE_LABEL,
  YAW_LABEL,
} from "../model/copy";
import { degToRad } from "../model/degrees";
import { AnchorCard, type AnchorCardProps } from "./anchor-card";

const PANORAMA: Panorama = {
  id: 7,
  territorySlug: "refinery-block-c",
  slug: "control-room-north-door",
  title: "Control room, north door",
  sourceBlobHash: "abc",
  position: { x: 4.82, y: 1.7, z: -2.145 },
  yawOffset: degToRad(137.5),
  defaultYaw: 0,
  updatedAt: "2026-09-04T10:00:00Z",
};

const props = (over: Partial<AnchorCardProps> = {}): AnchorCardProps => ({
  panorama: PANORAMA,
  index: { current: 1, total: 2 },
  inside: false,
  failed: false,
  cameraPositionRef: createRef<Vec3>(),
  cameraYawRef: createRef<number>(),
  saving: false,
  canDelete: true,
  onSave: vi.fn(),
  onDelete: vi.fn(),
  onToggleView: vi.fn(),
  onCalibrate: vi.fn(),
  onClose: vi.fn(),
  calibration: null,
  ...over,
});

const card = (over: Partial<AnchorCardProps> = {}) => {
  const all = props(over);
  const view = render(<AnchorCard {...all} />);
  return { ...view, ...all };
};

const CALIBRATION: NonNullable<AnchorCardProps["calibration"]> = {
  opacity: 0.65,
  onOpacity: vi.fn(),
  step: 0.005,
  onStep: vi.fn(),
  position: PANORAMA.position,
  onNudge: vi.fn(),
  yawOffset: PANORAMA.yawOffset,
  onYaw: vi.fn(),
  onSave: vi.fn(),
  onExit: vi.fn(),
};

describe("AnchorCard", () => {
  it("says which panorama of how many is being edited", () => {
    card();
    expect(screen.getByText("Panorama · editing")).toBeInTheDocument();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("prints no counter for a target that is gone", () => {
    card({ index: { current: 0, total: 2 } });
    expect(screen.queryByText(/of 2/)).not.toBeInTheDocument();
  });

  it("closes the editor", async () => {
    const { onClose } = card();
    await userEvent.click(screen.getByRole("button", { name: CLOSE_EDITOR }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("offers the way into the panorama, and out of it", async () => {
    const { onToggleView, unmount } = card();
    await userEvent.click(screen.getByRole("button", { name: ENTER_PANORAMA_VIEW }));
    expect(onToggleView).toHaveBeenCalledOnce();
    unmount();
    card({ inside: true });
    expect(screen.getByRole("button", { name: SWITCH_TO_3D })).toBeInTheDocument();
  });

  it("starts a calibration", async () => {
    const { onCalibrate } = card();
    await userEvent.click(screen.getByRole("button", { name: CALIBRATE }));
    expect(onCalibrate).toHaveBeenCalledOnce();
  });

  it("cannot save an anchor nothing has changed", () => {
    card();
    expect(screen.getByRole("button", { name: SAVE_ANCHOR })).toBeDisabled();
  });

  it("saves every field, so the PUT does not zero one", async () => {
    // Every one of the four differs from the panorama before Save is pressed,
    // so a payload that hardcodes any of them from the props goes red.
    const cameraPositionRef = createRef<Vec3>();
    cameraPositionRef.current = { x: 1.5, y: 2.5, z: 3.5 };
    const cameraYawRef = createRef<number>();
    cameraYawRef.current = degToRad(212.4);
    const { onSave } = card({ inside: true, cameraPositionRef, cameraYawRef });

    await userEvent.type(screen.getByLabelText(TITLE_LABEL), " (west)");
    await userEvent.click(screen.getByRole("button", { name: SET_DEFAULT_VIEW }));
    fireEvent.change(screen.getByRole("slider", { name: YAW_LABEL }), { target: { value: "200" } });
    // Inside the panorama the camera cannot be read into the anchor, so the
    // position is typed the way a person would type it.
    const x = screen.getByLabelText("Pos x");
    await userEvent.clear(x);
    await userEvent.type(x, "9.25");

    await userEvent.click(screen.getByRole("button", { name: SAVE_ANCHOR }));
    expect(onSave).toHaveBeenCalledWith({
      title: "Control room, north door (west)",
      position: { x: 9.25, y: 1.7, z: -2.145 },
      yawOffset: degToRad(200),
      defaultYaw: degToRad(212.4),
    });
  });

  it("reads the live camera into the position", async () => {
    const cameraPositionRef = createRef<Vec3>();
    cameraPositionRef.current = { x: 1.5, y: 2.5, z: 3.5 };
    card({ cameraPositionRef });
    await userEvent.click(screen.getByRole("button", { name: SET_FROM_CAMERA }));
    expect(screen.getByLabelText("Pos x")).toHaveValue("1.5");
    expect(screen.getByRole("button", { name: SAVE_ANCHOR })).toBeEnabled();
  });

  it("leaves the position alone when no camera has reported yet", async () => {
    card();
    await userEvent.click(screen.getByRole("button", { name: SET_FROM_CAMERA }));
    expect(screen.getByLabelText("Pos x")).toHaveValue("4.82");
  });

  it("captures the look direction as the default view", async () => {
    const cameraYawRef = createRef<number>();
    cameraYawRef.current = degToRad(137.5);
    card({ inside: true, cameraYawRef });
    expect(screen.queryByText(/Default look/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: SET_DEFAULT_VIEW }));
    expect(screen.getByText("Default look: 137.5°")).toBeInTheDocument();
  });

  it("reseeds the form when the anchor moves under it", async () => {
    const all = props();
    const { rerender } = render(<AnchorCard {...all} />);
    await userEvent.type(screen.getByLabelText(TITLE_LABEL), "!");
    const moved = { ...PANORAMA, position: { x: 9.1, y: 0.4, z: 0.2 } };
    rerender(<AnchorCard {...all} panorama={moved} />);
    expect(screen.getByLabelText("Pos x")).toHaveValue("9.1");
    expect(screen.getByLabelText(TITLE_LABEL)).toHaveValue("Control room, north door");
  });

  it("reseeds the yaw a calibration save changed under it, with the anchor unmoved", () => {
    const all = props();
    const { rerender } = render(<AnchorCard {...all} />);
    const calibrated = {
      ...PANORAMA,
      yawOffset: degToRad(212.4),
      updatedAt: "2026-09-04T10:05:00Z",
    };
    rerender(<AnchorCard {...all} panorama={calibrated} />);
    expect(screen.getByLabelText(`${YAW_LABEL} in degrees`)).toHaveValue(212.4);
    expect(screen.getByRole("button", { name: SAVE_ANCHOR })).toBeDisabled();
  });

  it("asks before deleting, and names what it is about to delete", async () => {
    const { onDelete } = card();
    await userEvent.click(screen.getByRole("button", { name: DELETE_PANORAMA }));
    expect(onDelete).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Delete panorama Control room, north door?"),
    ).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: DELETE_PANORAMA }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it("hides the delete action from a reader who may not delete", () => {
    card({ canDelete: false });
    expect(screen.queryByRole("button", { name: DELETE_PANORAMA })).not.toBeInTheDocument();
  });

  it("carries the tour's ids", () => {
    const { container } = card();
    for (const id of [
      "panorama-view-toggle",
      "panorama-calibrate",
      "panorama-set-from-camera",
      "panorama-yaw",
      "panorama-default-view",
      "panorama-save-anchor",
      "panorama-delete",
    ]) {
      expect(container.querySelector(`[data-tour="${id}"]`), id).not.toBeNull();
    }
  });

  it("replaces the fields with a fix-it sentence when the photo failed", () => {
    card({ failed: true });
    expect(screen.getByText(IMAGE_FAILED)).toBeInTheDocument();
    expect(screen.queryByLabelText(TITLE_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SAVE_ANCHOR })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: DELETE_PANORAMA })).toBeInTheDocument();
  });

  it("keeps the open alignment alive when the photo failed — it owns the only way out", () => {
    // The backdrop download can fail from the 3D view now that calibration
    // loads its own texture. Stripping the card to the callout there left the
    // ring drawn and draggable with no Save and no Exit to end it with.
    card({ failed: true, calibration: CALIBRATION });
    expect(screen.getByText(IMAGE_FAILED)).toBeInTheDocument();
    expect(screen.getByText(OPACITY_LABEL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SAVE })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: EXIT })).toBeInTheDocument();
    // Still nothing to type into or to save as an anchor.
    expect(screen.queryByLabelText(TITLE_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SAVE_ANCHOR })).not.toBeInTheDocument();
  });

  it("hands the numbers to the calibration block while one is open", () => {
    card({ calibration: CALIBRATION });
    expect(screen.getByText(OPACITY_LABEL)).toBeInTheDocument();
    expect(screen.queryByLabelText(TITLE_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: YAW_LABEL })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: SAVE_ANCHOR })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: DELETE_PANORAMA })).toBeInTheDocument();
  });

  it("holds the numbers while a save is in flight", () => {
    card({ saving: true });
    expect(screen.getByLabelText(TITLE_LABEL)).toBeDisabled();
    expect(screen.getByRole("button", { name: SAVE_ANCHOR })).toHaveAttribute("aria-busy", "true");
  });
});
