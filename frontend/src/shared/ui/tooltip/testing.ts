import { act, fireEvent, screen } from "@testing-library/react";
import { vi } from "vitest";
import { OPEN_DELAY } from "./use-tooltip";

// Test-only: imported by specs, never by index.ts, so no bundle reaches it.

/** A mouse resting on the control for the tooltip's delay; returns what opened. */
export function hoverTip(el: Element) {
  vi.useFakeTimers();
  fireEvent.pointerEnter(el, { pointerType: "mouse" });
  act(() => vi.advanceTimersByTime(OPEN_DELAY));
  vi.useRealTimers();
  return screen.queryByRole("tooltip");
}

/**
 * A keyboard user tabbing onto the control; returns what opened. jsdom answers
 * `:focus-visible` with false for every focus, so this one says it is visible.
 */
export function focusTip(el: HTMLElement) {
  const matches = Element.prototype.matches;
  const spy = vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
    return selector === ":focus-visible" || matches.call(this, selector);
  });
  fireEvent.focus(el);
  spy.mockRestore();
  return screen.queryByRole("tooltip");
}
