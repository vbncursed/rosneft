import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStoredChoice } from "./use-stored-choice";

const KEY = "andrey.test-choice";
const STORED = { all: null, points: "points", off: "hidden" } as const;

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("useStoredChoice", () => {
  it("reads the stored word, and no entry as the default", () => {
    localStorage.setItem(KEY, "points");
    expect(renderHook(() => useStoredChoice(KEY, STORED)).result.current[0]).toBe("points");

    localStorage.removeItem(KEY);
    expect(renderHook(() => useStoredChoice(KEY, STORED)).result.current[0]).toBe("all");
  });

  it("reads an unknown word as the default", () => {
    localStorage.setItem(KEY, "???");
    expect(renderHook(() => useStoredChoice(KEY, STORED)).result.current[0]).toBe("all");
  });

  it("stores the choice, and the default as no entry", () => {
    const { result } = renderHook(() => useStoredChoice(KEY, STORED));

    act(() => result.current[1]("off"));
    expect(result.current[0]).toBe("off");
    expect(localStorage.getItem(KEY)).toBe("hidden");

    act(() => result.current[1]("all"));
    expect(result.current[0]).toBe("all");
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("falls back to the default when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { result } = renderHook(() => useStoredChoice(KEY, STORED));
    expect(result.current[0]).toBe("all");
    act(() => result.current[1]("points"));
    expect(result.current[0]).toBe("points");
  });
});
