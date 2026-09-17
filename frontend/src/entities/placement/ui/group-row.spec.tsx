import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GroupRow } from "./group-row";

const group = { model: { slug: "tank", title: "storage-tank-500" }, instances: [{ id: 1, index: 1, label: "" }, { id: 2, index: 2, label: "" }, { id: 3, index: 3, label: "" }] };

describe("GroupRow", () => {
  it("is an expandable button naming the model and its count", async () => {
    const onToggle = vi.fn();
    render(<GroupRow group={group} expanded={false} selectedId={2} onToggle={onToggle} />);
    const row = screen.getByRole("button", { name: "storage-tank-500" });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(row).toHaveTextContent("3 instances · #2 selected");
    await userEvent.click(row);
    expect(onToggle).toHaveBeenCalledOnce();
  });
  it("reads as current while one of its instances is selected", () => {
    render(<GroupRow group={group} expanded selectedId={2} onToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "storage-tank-500" })).toHaveAttribute("aria-current", "true");
  });

  // A selection lights the group and its instance together; the group used to
  // fade in over 150ms while the instance flipped at once.
  it("repaints a selection at once, presses, and turns its chevron only with motion allowed", () => {
    render(<GroupRow group={group} expanded selectedId={2} onToggle={vi.fn()} />);
    const row = screen.getByRole("button", { name: "storage-tank-500" });
    expect(row).not.toHaveClass("transition-colors");
    expect(row).toHaveClass("active:scale-[0.99]");
    const chevron = row.querySelector("svg")!;
    expect(chevron).toHaveClass("transition-transform", "ease-out", "motion-reduce:transition-none", "rotate-90");
  });
});
