import { act, fireEvent, screen } from "@testing-library/react";
import { vi } from "vitest";
import { OPEN_DELAY } from "./use-tooltip";

// Test-only: imported by specs, never by index.ts, so no bundle reaches it.

/** A mouse resting on the control for the tooltip's delay; returns what opened. */
export function hoverTip(el: Element) {
  const wasFake = vi.isFakeTimers();
  if (!wasFake) vi.useFakeTimers();
  try {
    fireEvent.pointerEnter(el, { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(OPEN_DELAY));
    return screen.queryByRole("tooltip");
  } finally {
    if (!wasFake) vi.useRealTimers();
  }
}

/**
 * A keyboard user tabbing onto the control; returns what opened. The Tab comes
 * first — only a focus that follows one opens a tooltip — and jsdom answers
 * `:focus-visible` with false for every focus, so this one says it is visible.
 */
export function focusTip(el: HTMLElement) {
  const matches = Element.prototype.matches;
  const spy = vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
    return selector === ":focus-visible" || matches.call(this, selector);
  });
  try {
    fireEvent.keyDown(el, { key: "Tab" });
    fireEvent.focus(el);
    return screen.queryByRole("tooltip");
  } finally {
    spy.mockRestore();
  }
}
