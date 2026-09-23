import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { hoverTip } from "@/shared/ui/tooltip/testing";
import { EyeButton } from "./eye-button";

describe("EyeButton", () => {
  it("is a toggle named for hiding; a visible eye hides on click", async () => {
    const onToggle = vi.fn();
    render(<EyeButton state="visible" subject="storage-tank-500 #1" onToggle={onToggle} />);
    const eye = screen.getByRole("button", { name: "Hide storage-tank-500 #1" });
    expect(eye).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(eye);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("reads pressed when all of it is hidden, shows on click, and says Show in its tooltip", async () => {
    const onToggle = vi.fn();
    render(<EyeButton state="hidden" subject="group East yard" onToggle={onToggle} />);
    const eye = screen.getByRole("button", { name: "Hide group East yard" });
    expect(eye).toHaveAttribute("aria-pressed", "true");
    expect(hoverTip(eye)).toHaveTextContent("Show group East yard");
    await userEvent.click(eye);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  // Spec §1.5: mixed draws the open eye with a muted dot, and a click hides all.
  it("reads mixed, draws the dot, and hides everything on click", async () => {
    const onToggle = vi.fn();
    render(<EyeButton state="mixed" subject="every storage-tank-500" onToggle={onToggle} />);
    const eye = screen.getByRole("button", { name: "Hide every storage-tank-500" });
    expect(eye).toHaveAttribute("aria-pressed", "mixed");
    expect(screen.getByTestId("eye-mixed")).toBeInTheDocument();
    await userEvent.click(eye);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("waits while a write is in flight", () => {
    render(<EyeButton state="visible" subject="x" disabled onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Hide x" })).toBeDisabled();
  });
});
