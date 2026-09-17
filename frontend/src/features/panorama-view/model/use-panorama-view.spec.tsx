import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Panorama } from "@/entities/panorama";
import type { ViewerView } from "@/features/viewer-mode";
import { usePanoramaView } from "./use-panorama-view";

const panorama = (id: number, over: Partial<Panorama> = {}): Panorama => ({
  id,
  territorySlug: "t",
  slug: `p${id}`,
  title: `Point ${id}`,
  sourceBlobHash: `h${id}`,
  position: { x: 0, y: 0, z: 0 },
  yawOffset: 0,
  defaultYaw: 0,
  updatedAt: "t0",
  ...over,
});

// The reducer stands in as two pieces of state and four dispatchers, so the
// spec can watch which of them the hook reaches for.
const setup = (initial: Panorama[]) => {
  const spies = {
    enterPanorama: vi.fn(),
    exitPanorama: vi.fn(),
    startEdit: vi.fn(),
    closeEdit: vi.fn(),
  };
  const hook = renderHook(
    ({ list }) => {
      const [view, setView] = useState<ViewerView>({ kind: "scene" });
      const [editingPanoramaId, setEditing] = useState<number | null>(null);
      return usePanoramaView(list, {
        view,
        editingPanoramaId,
        enterPanorama: (id: number) => {
          spies.enterPanorama(id);
          setView({ kind: "panorama", id });
        },
        exitPanorama: () => {
          spies.exitPanorama();
          setView({ kind: "scene" });
        },
        startEdit: (id: number) => {
          spies.startEdit(id);
          setEditing(id);
        },
        closeEdit: () => {
          spies.closeEdit();
          setEditing(null);
        },
      });
    },
    { initialProps: { list: initial } },
  );
  return { ...hook, spies };
};

const three = [panorama(1), panorama(2), panorama(3)];

describe("usePanoramaView", () => {
  it("starts in the scene with nothing picked", () => {
    const { result } = setup(three);
    expect(result.current.active).toBeNull();
    expect(result.current.editing).toBeNull();
    expect(result.current.index).toEqual({ current: 0, total: 3 });
  });

  it("activating a capture both enters it and opens the card on it", () => {
    const { result, spies } = setup(three);
    act(() => result.current.activate(3));

    expect(spies.enterPanorama).toHaveBeenCalledWith(3);
    expect(spies.startEdit).toHaveBeenCalledWith(3);
    expect(result.current.active?.id).toBe(3);
    expect(result.current.editing?.id).toBe(3);
    expect(result.current.index).toEqual({ current: 3, total: 3 });
  });

  it("going back to the scene keeps the edit target — only the card's X clears it", () => {
    const { result, spies } = setup(three);
    act(() => result.current.activate(2));
    act(() => result.current.activate(null));

    expect(spies.exitPanorama).toHaveBeenCalledTimes(1);
    expect(spies.closeEdit).not.toHaveBeenCalled();
    expect(result.current.active).toBeNull();
    expect(result.current.editing?.id).toBe(2);

    act(() => result.current.closeEdit());
    expect(spies.closeEdit).toHaveBeenCalledTimes(1);
    expect(result.current.editing).toBeNull();
  });

  it("cycles scene → first → next → scene", () => {
    const { result } = setup(three);
    act(() => result.current.cycle());
    expect(result.current.active?.id).toBe(1);

    act(() => result.current.cycle());
    expect(result.current.active?.id).toBe(2);

    act(() => result.current.cycle());
    expect(result.current.active?.id).toBe(3);

    act(() => result.current.cycle());
    expect(result.current.active).toBeNull();
  });

  it("cycling a territory with no captures does nothing", () => {
    const { result, spies } = setup([]);
    act(() => result.current.cycle());
    expect(spies.enterPanorama).not.toHaveBeenCalled();
    expect(spies.exitPanorama).not.toHaveBeenCalled();
  });

  it("cycles from a capture that has left the list back to the scene", () => {
    // The row was deleted while the reader stood inside it: there is no "next",
    // and the scene is the only honest answer.
    const { result, rerender } = setup(three);
    act(() => result.current.activate(3));
    rerender({ list: [panorama(1), panorama(2)] });

    act(() => result.current.cycle());
    expect(result.current.active).toBeNull();
  });

  it("toggles between the edit target's sphere and the 3D scene", () => {
    const { result } = setup(three);
    act(() => result.current.startEdit(2));
    expect(result.current.active).toBeNull();

    act(() => result.current.toggleView());
    expect(result.current.active?.id).toBe(2);

    act(() => result.current.toggleView());
    expect(result.current.active).toBeNull();
    expect(result.current.editing?.id).toBe(2);
  });

  it("has nothing to toggle to without an edit target", () => {
    const { result, spies } = setup(three);
    act(() => result.current.toggleView());
    expect(spies.enterPanorama).not.toHaveBeenCalled();
    expect(spies.exitPanorama).not.toHaveBeenCalled();
  });

  it("re-derives both rows by id when the list changes under it", () => {
    const { result, rerender } = setup(three);
    act(() => result.current.activate(2));

    rerender({ list: [panorama(1), panorama(2, { title: "Renamed" }), panorama(3)] });
    expect(result.current.active?.title).toBe("Renamed");
    expect(result.current.editing?.title).toBe("Renamed");
  });
});
