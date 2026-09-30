import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MoveToGroupMenu, type MoveTarget } from "./move-to-group-menu";

const TARGETS: MoveTarget[] = [
  { key: "1", label: "East yard" },
  { key: "2", label: "West yard" },
  { key: "none", label: "No group" },
];

const trigger = () => screen.getByRole("button", { name: "Move storage-tank-500 #2 to group" });
const open = async () => userEvent.click(trigger());
const menu = (over: Partial<Parameters<typeof MoveToGroupMenu>[0]> = {}) =>
  render(
    <MoveToGroupMenu
      triggerLabel="Move storage-tank-500 #2 to group"
      targets={TARGETS}
      current="2"
      disabled={false}
      onMove={vi.fn()}
      {...over}
    />,
  );

describe("MoveToGroupMenu", () => {
  it("lists every target in order and greys the one it is already in", async () => {
    menu();
    await open();
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["East yard", "West yard", "No group"]);
    expect(screen.getByRole("menuitem", { name: "West yard" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "No group" })).toBeEnabled();
  });

  it("hands back the key of the target chosen", async () => {
    const onMove = vi.fn();
    menu({ onMove });
    await open();
    await userEvent.click(screen.getByRole("menuitem", { name: "East yard" }));
    expect(onMove).toHaveBeenLastCalledWith("1");
  });

  it("greys nothing when it sits in none of the targets", async () => {
    menu({ current: null });
    await open();
    for (const item of screen.getAllByRole("menuitem")) expect(item).toBeEnabled();
  });

  it("draws nothing when there is nowhere else to go", () => {
    const { container } = menu({ targets: [{ key: "none", label: "No group" }], current: "none" });
    expect(container).toBeEmptyDOMElement();
    const { container: empty } = menu({ targets: [] });
    expect(empty).toBeEmptyDOMElement();
  });

  // A trigger disabled under the focus it holds after a choice drops focus to
  // <body>; so the trigger stays live and the moves themselves wait.
  it("keeps its trigger while a write is in flight, but every move waits", async () => {
    menu({ current: null, disabled: true });
    expect(trigger()).toBeEnabled();
    await open();
    for (const item of screen.getAllByRole("menuitem")) expect(item).toBeDisabled();
  });
});
