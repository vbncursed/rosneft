import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearNotices, dismiss, notify, useNotices } from "./notify";

beforeEach(() => {
  vi.useFakeTimers();
  clearNotices();
});
afterEach(() => vi.useRealTimers());

describe("notify", () => {
  it("stacks the newest notice on top and dismisses it after five seconds", () => {
    const { result } = renderHook(() => useNotices());

    act(() => {
      notify.success("Saved");
      notify.error("Failed");
    });
    expect(result.current.map((n) => n.message)).toEqual(["Failed", "Saved"]);
    expect(result.current[0].tone).toBe("error");

    act(() => vi.advanceTimersByTime(5000));
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
});
