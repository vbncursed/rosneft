import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSectionFolds } from "./use-section-folds";

const PANORAMAS = "andrey.view.panoramas";
const DOCUMENTS = "andrey.view.documents";
const NONE = { panoramas: false, documents: false };

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

const mount = (forced = NONE) =>
  renderHook((f: typeof NONE) => useSectionFolds(f), { initialProps: forced });

describe("useSectionFolds", () => {
  it("starts with both lists folded", () => {
    const { result } = mount();
    expect(result.current.panoramas.open).toBe(false);
    expect(result.current.documents.open).toBe(false);
  });

  it("reads the remembered choice on mount, per section", () => {
    localStorage.setItem(DOCUMENTS, "open");
    const { result } = mount();
    expect(result.current.panoramas.open).toBe(false);
    expect(result.current.documents.open).toBe(true);
  });

  it("remembers an open and forgets it on fold", () => {
    const { result } = mount();
    act(() => result.current.panoramas.onToggle());
    expect(result.current.panoramas.open).toBe(true);
    expect(localStorage.getItem(PANORAMAS)).toBe("open");

    act(() => result.current.panoramas.onToggle());
    expect(result.current.panoramas.open).toBe(false);
    expect(localStorage.getItem(PANORAMAS)).toBeNull();
    expect(localStorage.getItem(DOCUMENTS)).toBeNull();
  });

  it("forces a section open without touching what was remembered", () => {
    const { result, rerender } = mount({ panoramas: true, documents: false });
    expect(result.current.panoramas.open).toBe(true);
    expect(result.current.documents.open).toBe(false);
    expect(localStorage.getItem(PANORAMAS)).toBeNull();

    rerender(NONE);
    expect(result.current.panoramas.open).toBe(false);
  });

  it("opens a section for the rail tile and remembers it", () => {
    const { result } = mount();
    act(() => result.current.reveal("documents"));
    expect(result.current.documents.open).toBe(true);
    expect(localStorage.getItem(DOCUMENTS)).toBe("open");
    // Already open stays open: the tile says "show me", never "hide".
    act(() => result.current.reveal("documents"));
    expect(result.current.documents.open).toBe(true);
  });

  it("tolerates storage that throws on read and on write", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = mount();
    expect(result.current.panoramas.open).toBe(false);
    act(() => result.current.panoramas.onToggle());
    expect(result.current.panoramas.open).toBe(true);
  });
});
