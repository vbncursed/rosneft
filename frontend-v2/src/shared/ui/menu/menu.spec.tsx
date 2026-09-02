import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Menu, type MenuItem } from "./menu";

const items = (overrides: Partial<MenuItem>[] = []): MenuItem[] =>
  [
    { label: "Edit roles", onSelect: vi.fn() },
    { label: "Make Root", onSelect: vi.fn(), tone: "accent" as const },
    { label: "Freeze", onSelect: vi.fn(), tone: "warn" as const },
    { label: "Delete", onSelect: vi.fn(), tone: "bad" as const },
  ].map((item, i) => ({ ...item, ...overrides[i] }));

const trigger = () => screen.getByRole("button", { name: "Row actions" });

describe("Menu", () => {
  it("stays closed until the trigger is used", () => {
    render(<Menu trigger="⋮" triggerLabel="Row actions" items={items()} />);
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens and lists every action", async () => {
    render(<Menu trigger="⋮" triggerLabel="Row actions" items={items()} />);
    await userEvent.click(trigger());
    expect(screen.getByRole("menu", { name: "Row actions" })).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
  });

  it("runs the chosen action and closes", async () => {
    const onSelect = vi.fn();
    render(
      <Menu trigger="⋮" triggerLabel="Row actions" items={items([{ onSelect }])} />,
    );
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit roles" }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens from the keyboard with focus on the first action", async () => {
    render(<Menu trigger="⋮" triggerLabel="Row actions" items={items()} />);
    trigger().focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Edit roles" })).toHaveFocus();
  });

  it("walks the actions with the arrow keys, skipping disabled ones", async () => {
    render(
      <Menu
        trigger="⋮"
        triggerLabel="Row actions"
        items={items([{}, { disabled: true }])}
      />,
    );
    trigger().focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Freeze" })).toHaveFocus();

    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Edit roles" })).toHaveFocus();
  });

  it("never runs a disabled action", async () => {
    const onSelect = vi.fn();
    render(
      <Menu
        trigger="⋮"
        triggerLabel="Row actions"
        items={items([{}, {}, {}, { onSelect, disabled: true }])}
      />,
    );
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("closes on Escape and on an outside pointer", async () => {
    render(
      <>
        <Menu trigger="⋮" triggerLabel="Row actions" items={items()} />
        <button type="button">elsewhere</button>
      </>,
    );
    await userEvent.click(trigger());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders an identity header above the actions", async () => {
    render(
      <Menu
        trigger="AI"
        triggerLabel="Account"
        header={<p>a.ivanova@example.com</p>}
        items={[{ label: "Log out", onSelect: vi.fn(), tone: "bad" }]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Account" }));
    expect(screen.getByText("a.ivanova@example.com")).toBeInTheDocument();
  });
});
