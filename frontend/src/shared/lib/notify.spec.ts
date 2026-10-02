import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearNotices, dismiss, notify, useNotices } from "./notify";

beforeEach(() => clearNotices());

describe("notify", () => {
  it("carries the action a failure offers", () => {
    const { result } = renderHook(() => useNotices());
    const run = vi.fn();
    act(() => {
      notify.error("Measurement not saved", { label: "Retry", run });
    });
    expect(result.current[0].action).toEqual({ label: "Retry", run });
  });

  // A repeated click on a failing control must not build a wall of cards.
  it("folds a repeat of the same failure into the card already shown", () => {
    const { result } = renderHook(() => useNotices());
    let first = 0;
    let second = 0;
    act(() => {
      first = notify.error("x");
      second = notify.error("x");
    });
    expect(result.current).toHaveLength(1);
    expect(second).toBe(first);
  });

  // Each Retry closes over its own attempt, so those cards stay apart.
  it("keeps two cards that each offer an action", () => {
    const { result } = renderHook(() => useNotices());
    act(() => {
      notify.error("x", { label: "Retry", run: vi.fn() });
      notify.error("x", { label: "Retry", run: vi.fn() });
      notify.warning("x");
    });
    expect(result.current).toHaveLength(3);
  });

  // ToastStack takes them oldest first and draws the newest on top.
  it("keeps notices oldest first", () => {
    const { result } = renderHook(() => useNotices());
    act(() => {
      notify.success("Saved");
      notify.error("Failed");
    });
    expect(result.current.map((n) => n.message)).toEqual(["Saved", "Failed"]);
  });

  // Only a card that waits for the reader folds; a repeated confirmation is its own event.
  it("gives a repeated confirmation its own card", () => {
    const { result } = renderHook(() => useNotices());
    act(() => {
      notify.success("Saved");
      notify.success("Saved");
    });
    expect(result.current).toHaveLength(2);
  });

  it("dismisses one notice by id and leaves the rest", () => {
    const { result } = renderHook(() => useNotices());
    let id = 0;
    act(() => {
      id = notify.info("First");
      notify.warning("Second");
    });

    act(() => dismiss(id));

    expect(result.current.map((n) => n.message)).toEqual(["Second"]);
  });

  // Specs call this from afterEach, which vitest runs before the setup file's
  // RTL cleanup — so whatever read the notices is still mounted, and a store
  // emit here is a React update outside act.
  it("clears without waking a still-mounted reader", () => {
    renderHook(() => useNotices());
    act(() => notify.info("Leftover"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    clearNotices();

    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
