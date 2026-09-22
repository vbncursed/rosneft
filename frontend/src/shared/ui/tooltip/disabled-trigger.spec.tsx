import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tooltip } from "./tooltip";
import { resetTooltipWarmup } from "./use-tooltip";

beforeEach(() => {
  vi.useFakeTimers();
  resetTooltipWarmup();
});
afterEach(() => vi.useRealTimers());

const view = (disabled: boolean) => (
  <Tooltip label="Delete">
    <button aria-label="Delete" disabled={disabled} />
  </Tooltip>
);

describe("Tooltip · a trigger that becomes disabled", () => {
  it("keeps the same button node, focusable again once enabled", () => {
    const { rerender } = render(view(false));
    const before = screen.getByRole("button", { name: "Delete" });
    rerender(view(true));
    expect(screen.getByRole("button", { name: "Delete" })).toBe(before);
    rerender(view(false));
    expect(screen.getByRole("button", { name: "Delete" })).toBe(before);
    before.focus();
    expect(before).toHaveFocus();
  });

  it("still opens on hover over the wrapper while disabled", () => {
    const { rerender } = render(view(false));
    rerender(view(true));
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Delete" }).parentElement!, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Delete");
  });

  it("opens on hover over the button itself while enabled", () => {
    render(view(false));
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Delete" }), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});
