import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Menu } from "@/shared/ui/menu";
import { Tooltip } from "./tooltip";
import { resetTooltipWarmup } from "./use-tooltip";

// A browser matches `:focus-visible` on any focus that follows a key press —
// a script's included. jsdom never does; this says it always does, so only the
// Tab rule can keep the tooltip shut.
const matches = Element.prototype.matches;
beforeEach(() => {
  resetTooltipWarmup();
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
    return selector === ":focus-visible" || matches.call(this, selector);
  });
});
afterEach(() => vi.restoreAllMocks());

const trigger = () => screen.getByRole("button", { name: "Row actions" });
const menu = (onSelect = vi.fn()) => <Menu trigger="⋮" triggerLabel="Row actions" items={[{ label: "Edit", onSelect }]} />;

describe("Tooltip · keyboard focus", () => {
  it("opens on the focus a Tab brings, Shift+Tab included", async () => {
    render(
      <>
        <Tooltip label="A">
          <button aria-label="A" />
        </Tooltip>
        <Tooltip label="B">
          <button aria-label="B" />
        </Tooltip>
      </>,
    );
    await userEvent.tab();
    expect(screen.getByRole("tooltip")).toHaveTextContent("A");
    await userEvent.tab();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("tooltip")).toHaveTextContent("A");
  });

  it("stays shut when Esc on an open Menu hands focus back to its trigger", async () => {
    render(menu());
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(trigger()).toHaveFocus();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("stays shut when Enter chooses a menu item and focus returns", async () => {
    const onSelect = vi.fn();
    render(menu(onSelect));
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(trigger()).toHaveFocus();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("stays shut on a script's focus after a Tab and then a pointer press", async () => {
    render(
      <Tooltip label="A">
        <button aria-label="A" />
      </Tooltip>,
    );
    await userEvent.keyboard("{Tab}");
    await userEvent.pointer({ keys: "[MouseLeft]", target: document.body });
    act(() => screen.getByRole("button", { name: "A" }).focus());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
