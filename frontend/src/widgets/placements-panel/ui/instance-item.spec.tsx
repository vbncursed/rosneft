import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ModelGroup } from "@/entities/placement";
import { InstanceItem, type RowContext } from "./instance-item";
import { ctx } from "./testing";

const MODEL: ModelGroup = {
  model: { slug: "tank", title: "storage-tank-500" },
  instances: [{ id: 2, index: 2, label: "", hidden: false, groupId: null }],
};

const item = (c: RowContext) => (
  <ul>
    <InstanceItem model={MODEL} instance={MODEL.instances[0]} ctx={c} />
  </ul>
);

describe("InstanceItem", () => {
  it("hides and moves one placement through the panel's bulk callbacks", async () => {
    const c = ctx();
    render(item(c));
    await userEvent.click(screen.getByRole("button", { name: "Hide storage-tank-500 #2" }));
    expect(c.onSetHidden).toHaveBeenCalledWith([2], true);
    await userEvent.click(screen.getByRole("button", { name: "Move storage-tank-500 #2 to group" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "East yard" }));
    expect(c.onMoveToGroup).toHaveBeenCalledWith([2], 4);
  });

  it("hangs Visible in under the selected row only", () => {
    const visibility = { panoramas: [{ id: 1, title: "North door" }], visiblePanoramaIds: [1], onToggle: vi.fn() };
    const { rerender } = render(item(ctx({ visibility })));
    expect(screen.queryByText("Visible in")).toBeNull();
    rerender(item(ctx({ visibility, selectedId: 2 })));
    expect(screen.getByRole("checkbox", { name: "North door" })).toBeChecked();
  });
});
