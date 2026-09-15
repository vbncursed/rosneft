import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
const deps = (over: { documents?: DocumentParts; placements?: ResolvedPlacement[] } = {}) => {
  const mode = {
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
  };
  const panel = { setTab: vi.fn(), setCollapsed: vi.fn() };
  const form = { openNew: vi.fn(), openRename: vi.fn() };
  const measure = {
    click: vi.fn(),
    closeActive: vi.fn(),
    removeSegment: vi.fn(),
    removeChain: vi.fn(),
    clear: vi.fn(),
  };
  const documents = over.documents ?? IDLE_DOCUMENTS;
  return {
    spies: { mode, editor, panel, form, documents },
    deps: {
      mode,
      measure,
      editor,
      form,
      panel,
      tour: basePageParts().tour,
      documents,
    } as unknown as HandlerDeps,
  };
};

const mount = (over?: Parameters<typeof deps>[0]) => {
  const { spies, deps: d } = deps(over);
  return { spies, ...renderHook(() => usePageHandlers(d)) };
};

describe("usePageHandlers", () => {
  it("starts with LOD 0 asked for and nothing else pending", () => {
    const { result } = mount();
    expect(result.current.view).toMatchObject({
      targetLod: 0,
      retryVersion: 0,
      resetVersion: 0,
      focusRequest: null,
      pickerOpen: false,
      query: "",
      expandedModel: null,
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
    expect(spies.editor.create).toHaveBeenCalledWith("storage-tank-500", 2);
    expect(spies.form.openNew).toHaveBeenCalledWith(11);
    expect(result.current.view.pickerOpen).toBe(false);
  });

  it("shows the View tab, unfolded, when a rail tile asks for one of its sections", () => {
    const { result, spies } = mount();
    act(() => result.current.on.onPanoramas());
    expect(spies.panel.setTab).toHaveBeenCalledWith("view");
    expect(spies.panel.setCollapsed).toHaveBeenCalledWith(false);
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

  it("keeps every canvas-bound callback stable across a re-render", () => {
    const { result, rerender } = mount();
    const first = result.current.on;
    act(() => result.current.on.onReset());
    rerender();
    expect(result.current.on.onLod).toBe(first.onLod);
    expect(result.current.on.onReset).toBe(first.onReset);
    expect(result.current.view.resetVersion).toBe(1);
  });
});
