import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { QuantityStepper } from "./quantity-stepper";

function Harness({ initial = 4, ...rest }: { initial?: number; min?: number; max?: number }) {
  const [value, setValue] = useState(initial);
  return <QuantityStepper value={value} onChange={setValue} {...rest} />;
}

const dec = () => screen.getByRole("button", { name: "Decrease quantity" });
const inc = () => screen.getByRole("button", { name: "Increase quantity" });

describe("QuantityStepper", () => {
  it("steps the value in both directions", async () => {
    render(<Harness />);
    await userEvent.click(inc());
    expect(screen.getByText("5")).toBeInTheDocument();
    await userEvent.click(dec());
    await userEvent.click(dec());
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("disables the minus once the minimum is reached", async () => {
    render(<Harness initial={2} min={1} />);
    expect(dec()).toBeEnabled();
    await userEvent.click(dec());
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(dec()).toBeDisabled();
  });

  it("disables the plus at the maximum", () => {
    render(<Harness initial={9} max={9} />);
    expect(inc()).toBeDisabled();
  });

  it("clamps rather than overshooting", async () => {
    const onChange = vi.fn();
    render(<QuantityStepper value={1} min={1} max={3} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("freezes both buttons when disabled", () => {
    render(<QuantityStepper value={4} onChange={() => {}} disabled />);
    expect(dec()).toBeDisabled();
    expect(inc()).toBeDisabled();
  });

  it("presses an enabled 28px step to 0.95", () => {
    render(<Harness />);
    const cls = inc().className.split(/\s+/);
    expect(cls).toEqual(
      expect.arrayContaining([
        "enabled:active:scale-95",
        "transition-[color,background-color,border-color,scale]",
        "ease-out",
      ]),
    );
  });
});

describe("QuantityStepper · step marks", () => {
  it("draws minus and plus as icons, not − + characters", () => {
    render(<Harness />);
    for (const step of [dec(), inc()]) {
      expect(step.querySelector("svg")).not.toBeNull();
      expect(step.textContent).toBe("");
    }
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

describe("QuantityStepper · tooltips", () => {
  it("names both steps, the one at its limit too", () => {
    render(<Harness initial={1} min={1} />);
    expect(hoverTip(inc())).toHaveTextContent("Increase quantity");
    fireEvent.pointerLeave(inc(), { pointerType: "mouse" });
    // A disabled button takes no pointer events: the tooltip's wrapper does.
    expect(hoverTip(dec().parentElement!)).toHaveTextContent("Decrease quantity");
  });
});
