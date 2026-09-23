import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UserGroupSection } from "@/entities/placement";
import { ctx } from "./testing";
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
  onCreate: vi.fn(async () => true),
  onRename: vi.fn(async () => true),
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
    expect(screen.getByRole("button", { name: "storage-tank-500 #3 · hidden" })).toHaveTextContent(/^storage-tank-500 #3$/);
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
    const eye = screen.getByRole("button", { name: "Hide group East yard" });
    expect(eye).toHaveAttribute("aria-disabled", "true");
    expect(eye).toHaveAttribute("data-dim", "true");
  });

  // E3: a write in flight waits without dimming — busy is not unavailable.
  it("waits the eye, undimmed, while a member is being written", () => {
    mount({ c: ctx({ expanded: "group:4", pendingIds: [3] }) });
    const eye = screen.getByRole("button", { name: "Hide group East yard" });
    expect(eye).toHaveAttribute("aria-busy", "true");
    expect(eye).not.toHaveAttribute("data-dim");
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

  it("renames inline from its menu, and folds back once the rename lands", async () => {
    let release!: (ok: boolean) => void;
    const a = actions({ onRename: vi.fn(() => new Promise<boolean>((res) => (release = res))) });
    const { rerender } = mount({ a });
    await userEvent.click(screen.getByRole("button", { name: "Actions for group East yard" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const field = screen.getByRole("textbox", { name: "Rename group East yard" });
    await userEvent.clear(field);
    await userEvent.type(field, "North yard{Enter}");
    expect(a.onRename).toHaveBeenCalledWith(4, "North yard");
    expect(screen.getByRole("textbox", { name: "Rename group East yard" })).toHaveValue("North yard");
    // P3: the parent reports the write in flight; the save cannot fire twice.
    rerender(
      <ul>
        <UserGroupItem section={SECTION} ctx={ctx({ expanded: "group:4" })} onAdd={vi.fn()} actions={{ ...a, busy: true }} />
      </ul>,
    );
    expect(screen.getByRole("button", { name: "Save group title" })).toBeDisabled();
    await act(async () => release(true));
    expect(screen.getByRole("button", { name: "East yard" })).toHaveFocus();
  });

  // P1: a rename answered after Cancel and a reopen belongs to the old field.
  it("keeps a reopened rename field open when the earlier rename lands late", async () => {
    let release!: (ok: boolean) => void;
    const a = actions({ onRename: vi.fn(() => new Promise<boolean>((res) => (release = res))) });
    mount({ a });
    const rename = async () => {
      await userEvent.click(screen.getByRole("button", { name: "Actions for group East yard" }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    };
    await rename();
    await userEvent.type(screen.getByRole("textbox", { name: "Rename group East yard" }), "2{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await rename();
    await act(async () => release(true));
    expect(screen.getByRole("textbox", { name: "Rename group East yard" })).toBeInTheDocument();
  });

  it("keeps the rename field and its text when the rename is refused", async () => {
    const a = actions({ onRename: vi.fn(async () => false) });
    mount({ a });
    await userEvent.click(screen.getByRole("button", { name: "Actions for group East yard" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const field = screen.getByRole("textbox", { name: "Rename group East yard" });
    await userEvent.clear(field);
    await userEvent.type(field, "West yard{Enter}");
    expect(a.onRename).toHaveBeenCalledWith(4, "West yard");
    expect(screen.getByRole("textbox", { name: "Rename group East yard" })).toHaveValue("West yard");
  });

  it("writes nothing for an unchanged title, and hands focus back on Cancel", async () => {
    const a = actions();
    mount({ a });
    await userEvent.click(screen.getByRole("button", { name: "Actions for group East yard" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Rename group East yard" }), "  {Enter}");
    expect(a.onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "East yard" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Actions for group East yard" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "East yard" })).toHaveFocus();
  });

  it("deletes the group, not its placements, from its menu", async () => {
    const a = actions();
    mount({ a });
    await userEvent.click(screen.getByRole("button", { name: "Actions for group East yard" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete group (placements stay)" }));
    expect(a.onDelete).toHaveBeenCalledWith(4);
  });

  // E4: the <li> leaves once the delete lands; focus must not fall to <body>.
  it("hands focus to the next group's disclosure when it deletes itself", async () => {
    const a = actions();
    const west: UserGroupSection = { group: { id: 5, title: "West yard" }, members: [] };
    render(
      <ul>
        <UserGroupItem section={SECTION} ctx={ctx()} onAdd={null} actions={a} />
        <UserGroupItem section={west} ctx={ctx()} onAdd={null} actions={a} />
      </ul>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Actions for group East yard" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete group (placements stay)" }));
    expect(a.onDelete).toHaveBeenCalledWith(4);
    expect(screen.getByRole("button", { name: "West yard" })).toHaveFocus();
  });

  it("hands focus to the search when it deletes the only group", async () => {
    render(<input type="search" aria-label="Search objects" />, { container: document.body.appendChild(document.createElement("div")) });
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Actions for group East yard" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete group (placements stay)" }));
    expect(screen.getByRole("searchbox", { name: "Search objects" })).toHaveFocus();
  });

  // The kebab holds focus when a write starts; a natively disabled one drops it.
  it("keeps the menu open-able while a group write is in flight, its actions greyed", async () => {
    mount({ a: actions({ busy: true }) });
    const kebab = screen.getByRole("button", { name: "Actions for group East yard" });
    expect(kebab).toBeEnabled();
    await userEvent.click(kebab);
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Delete group (placements stay)" })).toBeDisabled();
  });

  it("gives a reader without write no eye and no menu", () => {
    mount({ c: ctx({ expanded: "group:4", grants: { create: false, write: false, delete: false } }) });
    expect(screen.queryByRole("button", { name: /^Hide/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Actions for group/ })).toBeNull();
  });
});
