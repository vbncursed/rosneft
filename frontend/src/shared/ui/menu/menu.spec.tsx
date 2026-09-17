import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "@/shared/ui/modal";
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

describe("Menu · focus return", () => {
  // The focused action is removed with the menu; without a hand-back focus
  // fell to <body> and the next Tab started from the top of the document.
  it("hands focus back to the trigger after Escape", async () => {
    render(<Menu trigger="⋮" triggerLabel="Row actions" items={items()} />);
    trigger().focus();
    await userEvent.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("hands focus back to the trigger after choosing an action", async () => {
    render(<Menu trigger="⋮" triggerLabel="Row actions" items={items()} />);
    trigger().focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("leaves focus where an outside pointer put it", async () => {
    render(
      <>
        <Menu trigger="⋮" triggerLabel="Row actions" items={items()} />
        <button type="button">elsewhere</button>
      </>,
    );
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.getByRole("button", { name: "elsewhere" })).toHaveFocus();
  });

  it("lands on the trigger once a dialog the action opened is cancelled", async () => {
    function Row() {
      const [asking, setAsking] = useState(false);
      return (
        <>
          <Menu
            trigger="⋮"
            triggerLabel="Row actions"
            items={[{ label: "Make Root", onSelect: () => setAsking(true) }]}
          />
          <Modal open={asking} onClose={() => setAsking(false)} title="Make Root?">
            <button type="button" onClick={() => setAsking(false)}>
              Cancel
            </button>
          </Modal>
        </>
      );
    }
    render(<Row />);
    trigger().focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(trigger()).toHaveFocus();
  });
});

describe("Menu · states", () => {
  it("rings the keyboard-focused action in accent rather than a near-invisible fill", async () => {
    render(<Menu trigger="⋮" triggerLabel="Row actions" items={items()} />);
    await userEvent.click(trigger());
    const item = screen.getByRole("menuitem", { name: "Edit roles" });
    expect(item.classList).toContain("focus-visible:outline-accent");
    expect(item.className).not.toContain("focus-visible:outline-none");
    expect(item.className).not.toContain("focus-visible:bg-");
  });

  it("grows out of the trigger's corner and answers a press", async () => {
    const { rerender } = render(<Menu trigger="⋮" triggerLabel="Row actions" items={items()} />);
    expect(trigger().classList).toContain("active:scale-[0.95]");
    await userEvent.click(trigger());
    const menu = screen.getByRole("menu");
    expect(menu.classList).toContain("origin-top-right");
    expect(menu.classList).toContain("starting:opacity-0");
    expect(menu.classList).toContain("motion-safe:starting:scale-[0.97]");

    rerender(<Menu trigger="⋮" triggerLabel="Row actions" items={items()} align="start" />);
    expect(screen.getByRole("menu").classList).toContain("origin-top-left");
  });
});
