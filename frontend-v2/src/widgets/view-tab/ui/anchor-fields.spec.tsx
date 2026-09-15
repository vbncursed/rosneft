import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { POSITION_LABEL, SET_DEFAULT_VIEW, SET_FROM_CAMERA, TITLE_LABEL, YAW_LABEL } from "../model/copy";
import { degToRad } from "../model/degrees";
import { AnchorFields, type AnchorFieldsProps } from "./anchor-fields";

const PROPS: AnchorFieldsProps = {
  title: "Control room, north door",
  onTitle: vi.fn(),
  position: { x: 4.82, y: 1.7, z: -2.145 },
  onPosition: vi.fn(),
  yawOffset: degToRad(137.5),
  onYawOffset: vi.fn(),
  defaultYaw: 0,
  inside: false,
  onSetFromCamera: vi.fn(),
  onSetDefaultView: vi.fn(),
  disabled: false,
};

const fields = (over: Partial<AnchorFieldsProps> = {}) =>
  render(<AnchorFields {...PROPS} {...over} />);

describe("AnchorFields", () => {
  it("seeds the title from the panorama", () => {
    fields();
    expect(screen.getByLabelText(TITLE_LABEL)).toHaveValue("Control room, north door");
  });

  it("prints the anchor in the Pos row", () => {
    fields();
    expect(screen.getByLabelText("Pos x")).toHaveValue("4.82");
    expect(screen.getByLabelText("Pos z")).toHaveValue("-2.145");
  });

  it("labels the position row and offers the camera", () => {
    fields();
    expect(screen.getByText(POSITION_LABEL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: SET_FROM_CAMERA })).toBeEnabled();
  });

  it("cannot take the position from a camera locked inside the panorama", () => {
    fields({ inside: true });
    expect(screen.getByRole("button", { name: SET_FROM_CAMERA })).toBeDisabled();
  });

  it("captures the default view only from inside the panorama", () => {
    const { unmount } = fields();
    expect(screen.getByRole("button", { name: SET_DEFAULT_VIEW })).toBeDisabled();
    unmount();
    fields({ inside: true });
    expect(screen.getByRole("button", { name: SET_DEFAULT_VIEW })).toBeEnabled();
  });

  it("asks for the camera's look direction when it can", async () => {
    const onSetDefaultView = vi.fn();
    fields({ inside: true, onSetDefaultView });
    await userEvent.click(screen.getByRole("button", { name: SET_DEFAULT_VIEW }));
    expect(onSetDefaultView).toHaveBeenCalledOnce();
  });

  it("prints the yaw in degrees, and reports a typed one in radians", async () => {
    const onYawOffset = vi.fn();
    fields({ onYawOffset });
    const box = screen.getByLabelText(`${YAW_LABEL} in degrees`);
    expect(box).toHaveValue(137.5);
    await userEvent.clear(box);
    await userEvent.type(box, "90");
    expect(onYawOffset).toHaveBeenLastCalledWith(degToRad(90));
  });

  it("turns the sphere from the slider, in degrees", () => {
    const onYawOffset = vi.fn();
    fields({ onYawOffset });
    const slider = screen.getByRole("slider", { name: YAW_LABEL });
    expect(slider).toHaveAttribute("max", "360");
    expect(slider).toHaveValue("137.5");
  });

  it("stays quiet about a default look nobody has captured", () => {
    fields();
    expect(screen.queryByText(/Default look/)).not.toBeInTheDocument();
  });

  it("reports the captured default look", () => {
    fields({ defaultYaw: degToRad(137.5) });
    expect(screen.getByText("Default look: 137.5°")).toBeInTheDocument();
  });

  it("stops accepting numbers while a save is in flight", () => {
    fields({ disabled: true });
    expect(screen.getByLabelText(TITLE_LABEL)).toBeDisabled();
    expect(screen.getByLabelText("Pos x")).toBeDisabled();
    expect(screen.getByRole("slider", { name: YAW_LABEL })).toBeDisabled();
  });
});
