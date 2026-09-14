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
});
