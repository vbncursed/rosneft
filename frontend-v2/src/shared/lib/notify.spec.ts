import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNotices, dismiss, holdNotices, notify, releaseNotices, useNotices } from "./notify";

beforeEach(() => {
  vi.useFakeTimers();
  clearNotices();
});
afterEach(() => vi.useRealTimers());

describe("notify", () => {
  it("stacks the newest notice on top", () => {
    const { result } = renderHook(() => useNotices());

    act(() => {
      notify.success("Saved");
      notify.error("Failed");
    });
    expect(result.current.map((n) => n.message)).toEqual(["Failed", "Saved"]);
    expect(result.current[0].tone).toBe("error");
  });

  it("lets a confirmation go by itself after four seconds", () => {
    const { result } = renderHook(() => useNotices());
    act(() => {
      notify.success("Saved");
      notify.info("Queued");
    });

    act(() => vi.advanceTimersByTime(3999));
    expect(result.current).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toEqual([]);
  });

  // A reader who looked away for a second must still find the failure.
  it("keeps errors and warnings until they are dismissed", () => {
    const { result } = renderHook(() => useNotices());
    act(() => {
      notify.error("Failed");
      notify.warning("Careful");
    });

    act(() => vi.advanceTimersByTime(60_000));
    expect(result.current.map((n) => n.message)).toEqual(["Careful", "Failed"]);
  });

  it("stops the countdown while held and resumes with what was left", () => {
    const { result } = renderHook(() => useNotices());
    act(() => notify.success("Saved"));
    act(() => vi.advanceTimersByTime(3000));

    act(() => holdNotices("hover"));
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toHaveLength(1);

    act(() => releaseNotices("hover"));
    act(() => vi.advanceTimersByTime(999));
    expect(result.current).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toEqual([]);
  });

  // Hover and a hidden tab are separate reasons: leaving the card while the
  // tab is still hidden must not restart the clock.
  it("runs again only once every hold is released", () => {
    const { result } = renderHook(() => useNotices());
    act(() => {
      holdNotices("hidden");
      holdNotices("hover");
      notify.info("Queued");
    });

    act(() => releaseNotices("hover"));
    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current).toHaveLength(1);

    act(() => releaseNotices("hidden"));
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current).toEqual([]);
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
    vi.advanceTimersByTime(10_000);

    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
