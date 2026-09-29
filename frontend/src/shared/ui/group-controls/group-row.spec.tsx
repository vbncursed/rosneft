import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GroupRow, type GroupRowProps } from "./group-row";

const row = (over: Partial<GroupRowProps> = {}) => (
  <GroupRow
    title="storage-tank-500"
    line="3 instances · #2 selected"
    expanded={false}
    holdsSelection={false}
    onToggle={vi.fn()}
    {...over}
  />
);

describe("GroupRow", () => {
  it("is a disclosure named by its title, with the count line", async () => {
    const onToggle = vi.fn();
    render(row({ onToggle }));
    const disclosure = screen.getByRole("button", { name: "storage-tank-500" });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(disclosure).toHaveTextContent("3 instances · #2 selected");
    await userEvent.click(disclosure);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("reads as current while it holds the selection", () => {
    render(row({ expanded: true, holdsSelection: true }));
    expect(screen.getByRole("button", { name: "storage-tank-500" })).toHaveAttribute("aria-current", "true");
  });

  // The eye and the menu are siblings of the disclosure, never inside it: a
  // button in a button is invalid, and a click on the eye must not fold the row.
  it("draws its actions beside the disclosure, not inside it", async () => {
    const onToggle = vi.fn();
    const onEye = vi.fn();
    render(row({ onToggle, actions: <button type="button" onClick={onEye}>eye</button> }));
    const eye = screen.getByRole("button", { name: "eye" });
    expect(screen.getByRole("button", { name: "storage-tank-500" })).not.toContainElement(eye);
    await userEvent.click(eye);
    expect(onEye).toHaveBeenCalledOnce();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("repaints a selection at once, presses, and turns its chevron only with motion allowed", () => {
    render(row({ expanded: true, holdsSelection: true }));
    const disclosure = screen.getByRole("button", { name: "storage-tank-500" });
    expect(disclosure).not.toHaveClass("transition-colors");
    expect(disclosure).toHaveClass("active:scale-[0.99]");
    expect(disclosure.querySelector("svg")!).toHaveClass("transition-transform", "ease-out", "motion-reduce:transition-none", "rotate-90");
  });
});
