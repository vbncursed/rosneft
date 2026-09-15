import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("toggles when its label is clicked", async () => {
    render(<Checkbox label="Checked" />);
    const box = screen.getByRole("checkbox", { name: "Checked" });
    expect(box).not.toBeChecked();

    await userEvent.click(screen.getByText("Checked"));
    expect(box).toBeChecked();
  });

  it("reports changes to the caller", async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Snap" onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Snap" }));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("stays put while disabled", async () => {
    render(<Checkbox label="Disabled" disabled />);
    const box = screen.getByRole("checkbox", { name: "Disabled" });
    await userEvent.click(box);
    expect(box).not.toBeChecked();
  });

  it("honours a controlled checked prop", () => {
    render(<Checkbox label="Locked on" checked readOnly />);
    expect(screen.getByRole("checkbox", { name: "Locked on" })).toBeChecked();
  });

  it("owns the label's colour, so only one of the two is ever on the element", () => {
    // A caller passing a colour through labelClassName left `text-fg` and
    // `text-muted` on the same label, and the stylesheet's source order — not
    // the className string's — decided which one showed.
    const { rerender } = render(<Checkbox label="Tone" />);
    expect(screen.getByText("Tone")).toHaveClass("text-fg");
    expect(screen.getByText("Tone")).not.toHaveClass("text-muted");

    rerender(<Checkbox label="Tone" tone="muted" />);
    expect(screen.getByText("Tone")).toHaveClass("text-muted");
    expect(screen.getByText("Tone")).not.toHaveClass("text-fg");
  });

  it("is reachable and toggleable from the keyboard", async () => {
    render(<Checkbox label="Keyboard" />);
    await userEvent.tab();
    const box = screen.getByRole("checkbox", { name: "Keyboard" });
    expect(box).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(box).toBeChecked();
  });
});
