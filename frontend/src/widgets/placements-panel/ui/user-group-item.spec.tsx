import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UserGroupSection } from "@/entities/placement";
import { ctx } from "./instance-item.spec";
import { UserGroupItem, type GroupActions } from "./user-group-item";

const TANK = { model: { slug: "tank", title: "storage-tank-500" }, instances: [] };
const SECTION: UserGroupSection = {
  group: { id: 4, title: "East yard" },
  members: [
    { model: TANK, instance: { id: 1, index: 1, label: "", hidden: true, groupId: 4 } },
    { model: TANK, instance: { id: 3, index: 3, label: "", hidden: true, groupId: 4 } },
  ],
};
const actions = (over: Partial<GroupActions> = {}): GroupActions => ({
  busy: false,
  onCreate: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
  ...over,
});

const mount = (over: { c?: ReturnType<typeof ctx>; a?: GroupActions; onAdd?: ((id: number) => void) | null; section?: UserGroupSection } = {}) =>
  render(
    <ul>
      <UserGroupItem section={over.section ?? SECTION} ctx={over.c ?? ctx({ expanded: "group:4" })} onAdd={over.onAdd === undefined ? vi.fn() : over.onAdd} actions={over.a ?? actions()} />
    </ul>,
  );

describe("UserGroupItem", () => {
  it("names the group, counts its objects and lists them with their model's numbers", () => {
    mount();
    expect(screen.getByRole("button", { name: "East yard" })).toHaveTextContent("2 objects");
    expect(screen.getByRole("button", { name: "storage-tank-500 #3 · hidden" })).toBeInTheDocument();
  });

  it("shows every member again from an all-hidden eye", async () => {
    const c = ctx({ expanded: "group:4" });
    mount({ c });
    const eye = screen.getByRole("button", { name: "Hide group East yard" });
    expect(eye).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(eye);
    expect(c.onSetHidden).toHaveBeenCalledWith([1, 3], false);
  });

  it("disables the eye on an empty group — there is nothing to hide", () => {
    mount({ section: { ...SECTION, members: [] } });
    expect(screen.getByRole("button", { name: "Hide group East yard" })).toHaveAttribute("aria-disabled", "true");
  });

  it("places into itself from its own Add", async () => {
    const onAdd = vi.fn();
    mount({ onAdd });
    await userEvent.click(screen.getByRole("button", { name: "Add objects to group East yard" }));
    expect(onAdd).toHaveBeenCalledWith(4);
  });

  it("draws no Add without the create grant or inside a panorama (onAdd null)", () => {
    mount({ onAdd: null });
    expect(screen.queryByRole("button", { name: /Add objects to group/ })).toBeNull();
  });

  it("renames inline from its menu", async () => {
    const a = actions();
    mount({ a });
    await userEvent.click(screen.getByRole("button", { name: "Actions for group East yard" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const field = screen.getByRole("textbox", { name: "Rename group East yard" });
    await userEvent.clear(field);
    await userEvent.type(field, "North yard{Enter}");
    expect(a.onRename).toHaveBeenCalledWith(4, "North yard");
    expect(screen.getByRole("button", { name: "East yard" })).toBeInTheDocument();
  });

  it("deletes the group, not its placements, from its menu", async () => {
    const a = actions();
    mount({ a });
    await userEvent.click(screen.getByRole("button", { name: "Actions for group East yard" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete group (placements stay)" }));
    expect(a.onDelete).toHaveBeenCalledWith(4);
  });

  it("gives a reader without write no eye and no menu", () => {
    mount({ c: ctx({ expanded: "group:4", grants: { create: false, write: false, delete: false } }) });
    expect(screen.queryByRole("button", { name: /^Hide/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Actions for group/ })).toBeNull();
  });
});
