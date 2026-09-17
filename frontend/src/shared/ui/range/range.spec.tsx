import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Range } from "./range";

describe("Range", () => {
  it("is a labelled slider that reports a number", () => {
    const onChange = vi.fn();
    render(<Range label="Photo opacity" value={0.65} min={0.15} max={1} step={0.05} onChange={onChange} />);
    const slider = screen.getByRole("slider", { name: "Photo opacity" });
    expect(slider).toHaveValue("0.65");
    fireEvent.change(slider, { target: { value: "0.7" } });
    expect(onChange).toHaveBeenCalledWith(0.7);
  });

  it("paints the accent fill as far as the value", () => {
    render(<Range label="Yaw" value={90} min={0} max={360} step={1} onChange={() => {}} />);
    expect(screen.getByRole("slider").style.getPropertyValue("--range-fill")).toBe("25%");
  });

  it("is inert when disabled", () => {
    render(<Range label="Yaw" value={0} min={0} max={1} step={0.1} onChange={() => {}} disabled />);
    expect(screen.getByRole("slider")).toBeDisabled();
  });

  // Calibration is the slider's heaviest use: the knob answers the pointer
  // before the scene does, and the cursor says it is being held.
  it("answers hover and press on the knob, and shows a grab cursor", () => {
    render(<Range label="Yaw" value={0} min={0} max={1} step={0.1} onChange={() => {}} />);
    expect(screen.getByRole("slider")).toHaveClass(
      "cursor-grab",
      "enabled:active:cursor-grabbing",
      "enabled:hover:[&::-webkit-slider-thumb]:scale-110",
      "enabled:active:[&::-webkit-slider-thumb]:scale-95",
      "motion-reduce:[&::-webkit-slider-thumb]:transition-none",
    );
    expect(screen.getByRole("slider")).not.toHaveClass("cursor-pointer");
  });
});
