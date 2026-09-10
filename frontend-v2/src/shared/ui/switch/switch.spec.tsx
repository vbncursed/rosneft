import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

describe("Switch", () => {
  it("is a named switch that reports its state", () => {
    render(<Switch checked label="Snap to surface" onChange={vi.fn()} />);
    expect(screen.getByRole("switch", { name: "Snap to surface" })).toHaveAttribute("aria-checked", "true");
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
});
