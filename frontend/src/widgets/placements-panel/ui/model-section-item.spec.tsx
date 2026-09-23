import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ModelSection } from "@/entities/placement";
import { ctx } from "./testing";
import { ModelSectionItem } from "./model-section-item";

const SECTION: ModelSection = {
  group: {
    model: { slug: "tank", title: "storage-tank-500" },
    instances: [
      { id: 1, index: 1, label: "", hidden: true, groupId: 4 },
      { id: 2, index: 2, label: "", hidden: false, groupId: null },
    ],
  },
  shown: [{ id: 2, index: 2, label: "", hidden: false, groupId: null }],
};

const mount = (c = ctx()) => render(<ul><ModelSectionItem section={SECTION} ctx={c} /></ul>);

describe("ModelSectionItem", () => {
  it("counts only the ungrouped instances it lists", () => {
    mount();
    expect(screen.getByRole("button", { name: "storage-tank-500" })).toHaveTextContent("1 instance");
  });

  // G-3: the model's eye covers the grouped placement #1 too.
  it("reads mixed across every placement of the model, and hides them all", async () => {
    const c = ctx();
    mount(c);
    const eye = screen.getByRole("button", { name: "Hide every storage-tank-500" });
    expect(eye).toHaveAttribute("aria-pressed", "mixed");
    await userEvent.click(eye);
    expect(c.onSetHidden).toHaveBeenCalledWith([1, 2], true);
  });

  it("opens on its key, or when it holds the selection, and reports a toggle", async () => {
    const c = ctx();
    const { rerender } = mount(c);
    expect(screen.queryByRole("button", { name: /storage-tank-500 #2/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "storage-tank-500" }));
    expect(c.onToggleGroup).toHaveBeenCalledWith("tank");
    rerender(<ul><ModelSectionItem section={SECTION} ctx={ctx({ selectedId: 2 })} /></ul>);
    expect(screen.getByRole("button", { name: "storage-tank-500 #2" })).toHaveAttribute("aria-pressed", "true");
  });

  it("gives a reader without write no eye", () => {
    mount(ctx({ grants: { create: false, write: false, delete: false } }));
    expect(screen.queryByRole("button", { name: /^Hide/ })).toBeNull();
  });

  it("waits the eye while any of its placements is being written", () => {
    mount(ctx({ pendingIds: [1] }));
    expect(screen.getByRole("button", { name: "Hide every storage-tank-500" })).toHaveAttribute("aria-disabled", "true");
  });
});
