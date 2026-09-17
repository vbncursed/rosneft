import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

describe("Switch", () => {
  it("is a named switch that reports its state", () => {
    render(<Switch checked label="Snap to surface" onChange={vi.fn()} />);
    expect(screen.getByRole("switch", { name: "Snap to surface" })).toHaveAttribute("aria-checked", "true");
  });
  it("takes its name from the visible text when one is pointed at", () => {
    render(
      <>
        <span id="snap-label">Snap to surface</span>
        <Switch checked labelledBy="snap-label" label="ignored" onChange={vi.fn()} />
      </>,
    );
    const control = screen.getByRole("switch", { name: "Snap to surface" });
    // aria-label repeated the visible words; labelledBy cannot drift from them.
    expect(control).not.toHaveAttribute("aria-label");
    expect(control).toHaveAttribute("aria-labelledby", "snap-label");
  });

  it("flips on click and on Space", async () => {
    const onChange = vi.fn();
    render(<Switch checked={false} label="Snap to surface" onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).toHaveBeenCalledWith(true);
    screen.getByRole("switch").focus();
    await userEvent.keyboard(" ");
    expect(onChange).toHaveBeenCalledTimes(2);
  });
  it("does nothing while disabled", async () => {
    const onChange = vi.fn();
    render(<Switch checked disabled label="Snap to surface" onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });

  // The knob used to jump through the track's flex alignment while the ground
  // eased; now it slides, and under reduced motion only its colour eases.
  it("slides the knob on a transform instead of re-aligning the track", () => {
    const { rerender } = render(<Switch checked={false} label="Snap to surface" onChange={vi.fn()} />);
    const track = () => screen.getByRole("switch").className.split(/\s+/);
    const knob = () => screen.getByRole("switch").firstElementChild!.className.split(/\s+/);
    expect(track()).toContain("justify-start");
    expect(knob()).not.toContain("translate-x-4");
    expect(knob()).toEqual(
      expect.arrayContaining([
        "transition-[translate,background-color]",
        "ease-out",
        "motion-reduce:transition-[background-color]",
      ]),
    );

    rerender(<Switch checked label="Snap to surface" onChange={vi.fn()} />);
    expect(track()).toContain("justify-start");
    expect(track()).not.toContain("justify-end");
    expect(knob()).toContain("translate-x-4");
  });
});
