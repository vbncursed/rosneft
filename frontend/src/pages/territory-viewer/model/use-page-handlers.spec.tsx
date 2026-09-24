import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Chain } from "@/entities/measurement";
import type { ResolvedPlacement } from "@/entities/placement";
import { IDLE_DOCUMENTS, basePageParts } from "../territory-viewer-page.fixture";
import type { DocumentParts } from "./overlay-parts";
import { usePageHandlers, type HandlerDeps } from "./use-page-handlers";

const placement = (id: number, visiblePanoramaIds: number[]): ResolvedPlacement => ({
  ...basePageParts().placements[0],
  id,
  visiblePanoramaIds,
});

// Every dependency is one of the page's own hooks; this spec is about what
// happens between them, so each is a spy and nothing real is mounted.
const SAVED: Chain = { id: 1, points: [], closed: false, serverId: 7, sync: "saved" };
const LOCAL: Chain = { id: 2, points: [], closed: false, sync: "local" };

const deps = (
  over: {
    documents?: DocumentParts;
    placements?: ResolvedPlacement[];
    chains?: Chain[];
    canDeleteMeasurements?: boolean;
    selectedId?: number | null;
  } = {},
) => {
  const mode = {
    state: { mode: "orbit", view: { kind: "scene" }, selectedId: over.selectedId ?? null },
    enterPlace: vi.fn(),
    exitPlace: vi.fn(),
    select: vi.fn(),
    setGizmo: vi.fn(),
    toggleSnap: vi.fn(),
    toggleMeasure: vi.fn(),
    toggleMove: vi.fn(),
  };
  const editor = {
    placements: over.placements ?? [placement(4, [])],
    create: vi.fn(async () => 11),
    remove: vi.fn(),
    commitTransform: vi.fn(),
    setVisibility: vi.fn(),
    setHidden: vi.fn(async () => true),
    moveToGroup: vi.fn(),
  };
  const panel = { setTab: vi.fn(), setCollapsed: vi.fn() };
  const form = { openNew: vi.fn(), openRename: vi.fn() };
  const measure = {
    chains: over.chains ?? [],
    click: vi.fn(),
    closeActive: vi.fn(),
    removeSegment: vi.fn(),
    removeChain: vi.fn(),
    clear: vi.fn(),
  };
  const documents = over.documents ?? IDLE_DOCUMENTS;
  const openSection = vi.fn();
  return {
    spies: { mode, editor, panel, form, documents, measure, openSection },
    deps: {
      mode,
      measure,
      editor,
      form,
      panel,
      tour: basePageParts().tour,
      documents,
      openSection,
      canDeleteMeasurements: over.canDeleteMeasurements ?? true,
    } as unknown as HandlerDeps,
  };
};

const mount = (over?: Parameters<typeof deps>[0]) => {
  const { spies, deps: d } = deps(over);
  return { spies, ...renderHook(() => usePageHandlers(d)) };
};

describe("usePageHandlers", () => {
  describe("Clear", () => {
    it("asks first when saved chains would go, and clears everything once confirmed", () => {
      const { result, spies } = mount({ chains: [SAVED, LOCAL] });
      act(() => result.current.on.onClearMeasurements());
      expect(result.current.view.confirmClear).toBe(true);
      expect(spies.measure.clear).not.toHaveBeenCalled();
      act(() => result.current.on.onConfirmClear());
      expect(result.current.view.confirmClear).toBe(false);
      expect(spies.measure.clear).toHaveBeenCalledExactlyOnceWith(false);
    });

    it("clears nothing when the question is cancelled", () => {
      const { result, spies } = mount({ chains: [SAVED] });
      act(() => result.current.on.onClearMeasurements());
      act(() => result.current.on.onCancelClear());
      expect(result.current.view.confirmClear).toBe(false);
      expect(spies.measure.clear).not.toHaveBeenCalled();
    });

    it("clears at once when nothing saved is on screen", () => {
      const { result, spies } = mount({ chains: [LOCAL] });
      act(() => result.current.on.onClearMeasurements());
      expect(result.current.view.confirmClear).toBe(false);
      expect(spies.measure.clear).toHaveBeenCalledExactlyOnceWith(false);
    });

    // Review r-2: without measurement:delete the saved chains must stay on
    // screen, since nothing will delete them on the server.
    it("keeps the saved chains for a reader who cannot delete them, and asks nothing", () => {
      const { result, spies } = mount({ chains: [SAVED, LOCAL], canDeleteMeasurements: false });
      act(() => result.current.on.onClearMeasurements());
      expect(result.current.view.confirmClear).toBe(false);
      expect(spies.measure.clear).toHaveBeenCalledExactlyOnceWith(true);
    });
  });

  it("starts with LOD 0 asked for and nothing else pending", () => {
    const { result } = mount();
    expect(result.current.view).toMatchObject({
      targetLod: 0,
      retryVersion: 0,
      resetVersion: 0,
      playing: false,
      focusRequest: null,
      pickerOpen: false,
      query: "",
      expandedModel: null,
      confirmClear: false,
    });
    expect(result.current.failedAt).toBeNull();
  });

  it("stamps the clock when a failure lands, and leaves it there while the same one is reported", () => {
    const { result } = mount();
    act(() =>
      result.current.on.onLod({
        shown: null,
        target: 0,
        percent: null,
        progressText: null,
        failure: { hash: "h1", status: 502 },
      }),
    );
    const stamped = result.current.failedAt;
    expect(stamped).not.toBeNull();

    act(() =>
      result.current.on.onLod({
        shown: null,
        target: 0,
        percent: null,
        progressText: null,
        failure: { hash: "h1", status: 502 },
      }),
    );
    expect(result.current.failedAt).toBe(stamped);
  });

  it("enters place mode with the picker, and leaves it when the picker goes", () => {
    const { result, spies } = mount();
    act(() => result.current.on.onAdd());
    expect(spies.mode.enterPlace).toHaveBeenCalled();
    expect(result.current.view.pickerOpen).toBe(true);

    act(() => result.current.on.onClosePicker());
    expect(spies.mode.exitPlace).toHaveBeenCalled();
    expect(result.current.view.pickerOpen).toBe(false);
  });

  it("opens the new object's form once the batch has landed", async () => {
    const { result, spies } = mount();
    await act(async () => result.current.on.onPlace("storage-tank-500", 2));
    expect(spies.editor.create).toHaveBeenCalledWith("storage-tank-500", 2, null);
    expect(spies.form.openNew).toHaveBeenCalledWith(11);
    expect(result.current.view.pickerOpen).toBe(false);
  });

  it("shows the View tab, unfolded, when a rail tile asks for one of its sections", () => {
    const { result, spies } = mount();
    act(() => result.current.on.onPanoramas());
    expect(spies.panel.setTab).toHaveBeenCalledWith("view");
    expect(spies.panel.setCollapsed).toHaveBeenCalledWith(false);
  });

  it("opens the folded list the rail tile names, and only that one", () => {
    const { result, spies } = mount();
    act(() => result.current.on.onPanoramas());
    expect(spies.openSection).toHaveBeenCalledExactlyOnceWith("panoramas");
    act(() => result.current.on.onDocuments());
    expect(spies.openSection).toHaveBeenLastCalledWith("documents");
    expect(spies.openSection).toHaveBeenCalledTimes(2);
  });

  it("brings a hidden document window back before it scrolls to the list", () => {
    const onWindow = vi.fn();
    const { result } = mount({
      documents: {
        ...IDLE_DOCUMENTS,
        active: { id: 7, territorySlug: "t", title: "Fire plan.pdf", sourceBlobHash: "d7", createdAt: "" },
        window: "collapsed",
        onWindow,
      },
    });
    act(() => result.current.on.onDocuments());
    expect(onWindow).toHaveBeenCalledWith("pip");
  });

  it("leaves an open window where it is", () => {
    const onWindow = vi.fn();
    const { result } = mount({
      documents: {
        ...IDLE_DOCUMENTS,
        active: { id: 7, territorySlug: "t", title: "Fire plan.pdf", sourceBlobHash: "d7", createdAt: "" },
        window: "pip",
        onWindow,
      },
    });
    act(() => result.current.on.onDocuments());
    expect(onWindow).not.toHaveBeenCalled();
  });

  it("adds a capture to the allowlist without disturbing the ones already there", () => {
    const { result, spies } = mount({ placements: [placement(4, [2])] });
    act(() => result.current.on.onVisibility(4, 5, true));
    expect(spies.editor.setVisibility).toHaveBeenCalledWith(4, [2, 5]);
  });

  it("ticks a capture only once, however often the box is toggled on", () => {
    const { result, spies } = mount({ placements: [placement(4, [5])] });
    act(() => result.current.on.onVisibility(4, 5, true));
    expect(spies.editor.setVisibility).toHaveBeenCalledWith(4, [5]);
  });

  it("takes a capture out of the allowlist when the box is cleared", () => {
    const { result, spies } = mount({ placements: [placement(4, [2, 5])] });
    act(() => result.current.on.onVisibility(4, 5, false));
    expect(spies.editor.setVisibility).toHaveBeenCalledWith(4, [2]);
  });

  it("writes nothing for a placement the editor has never heard of", () => {
    const { result, spies } = mount();
    act(() => result.current.on.onVisibility(99, 5, true));
    expect(spies.editor.setVisibility).not.toHaveBeenCalled();
  });

  it("flies on Play, and a reset or the rig's own stop lands it", () => {
    const { result } = mount();
    act(() => result.current.on.onPlay());
    expect(result.current.view.playing).toBe(true);
    act(() => result.current.on.onReset());
    expect(result.current.view).toMatchObject({ playing: false, resetVersion: 1 });
    act(() => result.current.on.onPlay());
    act(() => result.current.on.onPlayStop());
    expect(result.current.view.playing).toBe(false);
  });

  it("lands the flight when a placement is focused", () => {
    const { result } = mount();
    act(() => result.current.on.onPlay());
    act(() => result.current.on.onFocus(7));
    expect(result.current.view.playing).toBe(false);
    expect(result.current.view.focusRequest).toEqual([7]);
  });

  it("keeps every canvas-bound callback stable across a re-render", () => {
    const { result, rerender } = mount();
    const first = result.current.on;
    act(() => result.current.on.onReset());
    act(() => result.current.on.onPlay());
    rerender();
    expect(result.current.on.onLod).toBe(first.onLod);
    expect(result.current.on.onReset).toBe(first.onReset);
    expect(result.current.on.onPlay).toBe(first.onPlay);
    expect(result.current.on.onPlayStop).toBe(first.onPlayStop);
    expect(result.current.view.resetVersion).toBe(1);
  });

  describe("hiding and groups", () => {
    it("drops the selection when it is among the placements hidden", async () => {
      const { result, spies } = mount({ selectedId: 4 });
      await act(() => result.current.on.onSetHidden([4, 5], true));
      expect(spies.mode.select).toHaveBeenCalledWith(null);
      expect(spies.editor.setHidden).toHaveBeenCalledWith([4, 5], true);
    });

    it("places into the group whose Add opened the picker, and nowhere after a plain Add", async () => {
      const { result, spies } = mount();
      act(() => result.current.on.onAddToGroup(7));
      expect(result.current.view.pickerOpen).toBe(true);
      await act(async () => result.current.on.onPlace("tank", 2));
      expect(spies.editor.create).toHaveBeenLastCalledWith("tank", 2, 7);

      act(() => result.current.on.onAdd());
      await act(async () => result.current.on.onPlace("tank", 1));
      expect(spies.editor.create).toHaveBeenLastCalledWith("tank", 1, null);
    });

    it("moves through the editor unchanged", () => {
      const { result, spies } = mount();
      expect(result.current.on.onMoveToGroup).toBe(spies.editor.moveToGroup);
    });
  });
});
