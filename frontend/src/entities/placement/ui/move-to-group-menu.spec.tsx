import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MoveToGroupMenu, NO_GROUP } from "./move-to-group-menu";

const GROUPS = [
  { id: 1, title: "East yard" },
  { id: 2, title: "West yard" },
];

const trigger = () => screen.getByRole("button", { name: "Move storage-tank-500 #2 to group" });
const open = async () => userEvent.click(trigger());

describe("MoveToGroupMenu", () => {
  it("lists every group then No group, and greys the one it is already in", async () => {
    render(<MoveToGroupMenu name="storage-tank-500 #2" groups={GROUPS} current={2} disabled={false} onMove={vi.fn()} />);
    await open();
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["East yard", "West yard", NO_GROUP]);
    expect(screen.getByRole("menuitem", { name: "West yard" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: NO_GROUP })).toBeEnabled();
  });

  it("moves into the group chosen, and out with No group", async () => {
    const onMove = vi.fn();
    render(<MoveToGroupMenu name="storage-tank-500 #2" groups={GROUPS} current={2} disabled={false} onMove={onMove} />);
    await open();
    await userEvent.click(screen.getByRole("menuitem", { name: "East yard" }));
    expect(onMove).toHaveBeenLastCalledWith(1);
    await open();
    await userEvent.click(screen.getByRole("menuitem", { name: NO_GROUP }));
    expect(onMove).toHaveBeenLastCalledWith(null);
  });

  it("draws nothing when there is nowhere to move to", () => {
    const { container } = render(
      <MoveToGroupMenu name="storage-tank-500 #2" groups={[]} current={null} disabled={false} onMove={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // A trigger disabled under the focus it holds after a choice drops focus to
  // <body>; so the trigger stays live and the moves themselves wait.
  it("keeps its trigger while a write is in flight, but every move waits", async () => {
    render(<MoveToGroupMenu name="storage-tank-500 #2" groups={GROUPS} current={null} disabled onMove={vi.fn()} />);
    expect(trigger()).toBeEnabled();
    await open();
    for (const item of screen.getAllByRole("menuitem")) expect(item).toBeDisabled();
  });
});
