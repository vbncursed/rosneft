import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fireEvent } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";
import { EXIT, NUDGE_LABEL, OPACITY_LABEL, SAVE, YAW_SHORT } from "../model/copy";
import { degToRad } from "../model/degrees";
import { CalibrationCard, type CalibrationCardProps } from "./calibration-card";

const PROPS: CalibrationCardProps = {
  opacity: 0.65,
  onOpacity: vi.fn(),
  step: 0.005,
  onStep: vi.fn(),
  position: { x: 4.82, y: 1.7, z: -2.145 },
  onNudge: vi.fn(),
  yawOffset: degToRad(137.5),
  onYaw: vi.fn(),
  onSave: vi.fn(),
  onExit: vi.fn(),
};

const calibration = (over: Partial<CalibrationCardProps> = {}) =>
  render(<CalibrationCard {...PROPS} {...over} />);

describe("CalibrationCard", () => {
  it("prints the ghosted photo's opacity", () => {
    calibration();
    expect(screen.getByText(OPACITY_LABEL)).toBeInTheDocument();
    expect(screen.getByText("65 %")).toBeInTheDocument();
  });

  it("keeps the photo visible enough to align against", async () => {
    const onOpacity = vi.fn();
    calibration({ onOpacity });
    const slider = screen.getByRole("slider", { name: OPACITY_LABEL });
    expect(slider).toHaveAttribute("min", "0.15");
    expect(slider).toHaveAttribute("max", "1");
    expect(slider).toHaveAttribute("step", "0.05");
    fireEvent.change(slider, { target: { value: "0.8" } });
    expect(onOpacity).toHaveBeenCalledWith(0.8);
  });

  it("shows which nudge step is live", () => {
    calibration();
    expect(screen.getByText(NUDGE_LABEL)).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: NUDGE_LABEL })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Fine" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Coarse" })).not.toBeChecked();
  });

  it("changes the step in scene units", async () => {
    const onStep = vi.fn();
    calibration({ onStep });
    await userEvent.click(screen.getByRole("radio", { name: "Coarse" }));
    expect(onStep).toHaveBeenCalledWith(0.1);
  });

  it("prints each axis to a thousandth", () => {
    calibration();
    expect(screen.getByText("4.820")).toBeInTheDocument();
    expect(screen.getByText("1.700")).toBeInTheDocument();
    expect(screen.getByText("-2.145")).toBeInTheDocument();
  });

  it("nudges one axis by the live step, in both directions", async () => {
    const onNudge = vi.fn();
    calibration({ onNudge, step: 0.02 });
    await userEvent.click(screen.getByRole("button", { name: "Increase X" }));
    expect(onNudge).toHaveBeenLastCalledWith("x", 0.02);
    await userEvent.click(screen.getByRole("button", { name: "Decrease Z" }));
    expect(onNudge).toHaveBeenLastCalledWith("z", -0.02);
  });

  it("turns the sphere in degrees and reports radians", () => {
    const onYaw = vi.fn();
    calibration({ onYaw });
    expect(screen.getByText("137.5°")).toBeInTheDocument();
    const slider = screen.getByRole("slider", { name: YAW_SHORT });
    expect(slider).toHaveValue("137.5");
    fireEvent.change(slider, { target: { value: "90" } });
    expect(onYaw).toHaveBeenCalledWith(degToRad(90));
  });

  it("saves the alignment, or leaves it", async () => {
    const onSave = vi.fn();
    const onExit = vi.fn();
    calibration({ onSave, onExit });
    await userEvent.click(screen.getByRole("button", { name: SAVE }));
    expect(onSave).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: EXIT }));
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("presses the nudge arrows", () => {
    calibration();
    expect(screen.getByRole("button", { name: "Increase X" })).toHaveClass(
      "active:scale-[0.97]",
      "ease-out",
    );
  });
});
