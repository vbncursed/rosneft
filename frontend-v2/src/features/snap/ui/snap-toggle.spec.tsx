import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SnapToggle } from "./snap-toggle";

describe("SnapToggle", () => {
  it("states which way it is set, in words", () => {
    const { rerender } = render(<SnapToggle on={false} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: /Snap to surface · off/ })).toBeInTheDocument();

    rerender(<SnapToggle on onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: /Snap to surface · on/ })).toBeInTheDocument();
  });

  it("reports its state through aria-pressed", () => {
    render(<SnapToggle on onToggle={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles on click", async () => {
    const onToggle = vi.fn();
    render(<SnapToggle on={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("takes the success skin only while on", () => {
    const { rerender } = render(<SnapToggle on onToggle={() => {}} />);
    expect(screen.getByRole("button").className).toContain("border-ok");

    rerender(<SnapToggle on={false} onToggle={() => {}} />);
    expect(screen.getByRole("button").className).toContain("border-line-2");
  });

  it("hides the shortcut chip from the accessible name", () => {
    render(<SnapToggle on onToggle={() => {}} />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toBeNull();
    expect(screen.getByText("G")).toHaveAttribute("aria-hidden", "true");
  });
});
