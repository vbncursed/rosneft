import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useViewSections, type SectionMode } from "./use-view-sections";

const SCENE: SectionMode = { view: { kind: "scene" }, editingPanoramaId: null };

afterEach(() => localStorage.clear());

const open = (mode: SectionMode, touring = false) => {
  const { result } = renderHook(() => useViewSections(mode, touring));
  return { panoramas: result.current.panoramas.open, documents: result.current.documents.open };
};

describe("useViewSections", () => {
  it("leaves both lists folded in the plain 3D view", () => {
    expect(open(SCENE)).toEqual({ panoramas: false, documents: false });
  });

  it("holds Panoramas open while the reader stands in one", () => {
    expect(open({ ...SCENE, view: { kind: "panorama", id: 7 } })).toEqual({
      panoramas: true,
      documents: false,
    });
  });

  it("holds Panoramas open while one is being edited or calibrated", () => {
    expect(open({ ...SCENE, editingPanoramaId: 7 }).panoramas).toBe(true);
  });

  it("holds both open while a guided tour runs, and remembers nothing for it", () => {
    expect(open(SCENE, true)).toEqual({ panoramas: true, documents: true });
    expect(localStorage.length).toBe(0);
  });
});
