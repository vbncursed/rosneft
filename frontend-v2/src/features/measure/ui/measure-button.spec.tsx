import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MeasureButton } from "./measure-button";

describe("MeasureButton", () => {
  it("says what it will do, then what it is doing", () => {
    const { rerender } = render(<MeasureButton active={false} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: /Measure/ })).toBeInTheDocument();

    rerender(<MeasureButton active onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: /Measuring/ })).toBeInTheDocument();
  });

  it("reports its state through aria-pressed", () => {
    const { rerender } = render(<MeasureButton active={false} onToggle={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");

    rerender(<MeasureButton active onToggle={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles on click", async () => {
    const onToggle = vi.fn();
    render(<MeasureButton active={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("names its keyboard shortcut in the tooltip", () => {
    render(<MeasureButton active={false} onToggle={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute("title", "Measure (M)");
  });

  it("accents itself while measuring", () => {
    render(<MeasureButton active onToggle={() => {}} />);
    expect(screen.getByRole("button").className).toContain("text-accent");
  });
});
