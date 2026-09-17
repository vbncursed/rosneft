import { describe, expect, it } from "vitest";
import { INITIAL_VIEWER_MODE, viewerModeReducer as reduce, type ViewerModeState } from "./viewer-mode";

const selected: ViewerModeState = { ...INITIAL_VIEWER_MODE, selectedId: 7 };
const measuring: ViewerModeState = { ...INITIAL_VIEWER_MODE, mode: "measure" };

describe("viewerModeReducer", () => {
  it("starts in orbit with nothing selected, translate, snap off", () => {
    expect(INITIAL_VIEWER_MODE).toEqual({
      mode: "orbit",
      selectedId: null,
      gizmo: "translate",
      snap: false,
      view: { kind: "scene" },
      move: false,
      editingPanoramaId: null,
    });
  });

  it("entering measure drops the selection; leaving it returns to orbit", () => {
    expect(reduce(selected, { type: "toggleMeasure" })).toEqual({ ...selected, mode: "measure", selectedId: null });
    expect(reduce(measuring, { type: "toggleMeasure" })).toEqual(INITIAL_VIEWER_MODE);
    expect(reduce(measuring, { type: "exitMeasure" })).toEqual(INITIAL_VIEWER_MODE);
    expect(reduce(INITIAL_VIEWER_MODE, { type: "exitMeasure" })).toBe(INITIAL_VIEWER_MODE);
  });

  it("selecting leaves measure and place mode; a null select only clears", () => {
    expect(reduce(measuring, { type: "select", id: 3 })).toEqual({ ...INITIAL_VIEWER_MODE, selectedId: 3 });
    expect(reduce({ ...INITIAL_VIEWER_MODE, mode: "place" }, { type: "select", id: 3 })).toEqual({ ...INITIAL_VIEWER_MODE, selectedId: 3 });
    expect(reduce(selected, { type: "select", id: null })).toEqual(INITIAL_VIEWER_MODE);
  });

  it("gizmo mode and snap are plain switches", () => {
    expect(reduce(selected, { type: "setGizmo", gizmo: "scale" }).gizmo).toBe("scale");
    expect(reduce(INITIAL_VIEWER_MODE, { type: "toggleSnap" }).snap).toBe(true);
  });

  it("place mode is entered from orbit and left back to orbit", () => {
    expect(reduce(selected, { type: "enterPlace" })).toEqual({ ...INITIAL_VIEWER_MODE, mode: "place" });
    expect(reduce({ ...INITIAL_VIEWER_MODE, mode: "place" }, { type: "exitPlace" })).toEqual(INITIAL_VIEWER_MODE);
    expect(reduce(INITIAL_VIEWER_MODE, { type: "exitPlace" })).toBe(INITIAL_VIEWER_MODE);
  });

  // The three Esc layers, top to bottom: an open chain (handled by the caller,
  // reported here as chainOpen), a selection, then the mode itself.
  it("escape: an open chain is the caller's, and the state stays", () => {
    expect(reduce(measuring, { type: "escape", chainOpen: true })).toBe(measuring);
  });
  it("escape: a selection clears before the mode changes", () => {
    expect(reduce({ ...measuring, selectedId: 2 }, { type: "escape", chainOpen: false })).toEqual({ ...measuring, selectedId: null });
    expect(reduce(selected, { type: "escape", chainOpen: false })).toEqual(INITIAL_VIEWER_MODE);
  });
  it("escape: with nothing selected the mode returns to orbit", () => {
    expect(reduce(measuring, { type: "escape", chainOpen: false })).toEqual(INITIAL_VIEWER_MODE);
    expect(reduce({ ...INITIAL_VIEWER_MODE, mode: "place" }, { type: "escape", chainOpen: false })).toEqual(INITIAL_VIEWER_MODE);
    expect(reduce(INITIAL_VIEWER_MODE, { type: "escape", chainOpen: false })).toBe(INITIAL_VIEWER_MODE);
  });
});

const inPano = { ...INITIAL_VIEWER_MODE, view: { kind: "panorama", id: 3 } as const };

describe("the view, move and the editing target", () => {
  it("starts in the scene, not moving, editing nothing", () => {
    expect(INITIAL_VIEWER_MODE.view).toEqual({ kind: "scene" });
    expect(INITIAL_VIEWER_MODE.move).toBe(false);
    expect(INITIAL_VIEWER_MODE.editingPanoramaId).toBeNull();
  });

  it("entering a panorama leaves place and measure and move, keeps the selection", () => {
    const s = reduce({ ...INITIAL_VIEWER_MODE, mode: "measure", move: true, selectedId: 4 }, { type: "enterPanorama", id: 3 });
    expect(s).toMatchObject({ mode: "orbit", move: false, selectedId: 4, view: { kind: "panorama", id: 3 } });
  });

  it("exiting returns to the scene and touches nothing else", () => {
    expect(reduce({ ...inPano, selectedId: 4 }, { type: "exitPanorama" })).toMatchObject({ view: { kind: "scene" }, selectedId: 4 });
  });

  it("place cannot be entered inside a panorama", () => {
    expect(reduce(inPano, { type: "enterPlace" })).toBe(inPano);
  });

  it("move is a scene-only mode: on, it leaves measure and deselects; off again on toggle; never inside a panorama", () => {
    const on = reduce({ ...INITIAL_VIEWER_MODE, mode: "measure", selectedId: 2 }, { type: "toggleMove" });
    expect(on).toMatchObject({ move: true, mode: "orbit", selectedId: null });
    expect(reduce(on, { type: "toggleMove" }).move).toBe(false);
    expect(reduce(inPano, { type: "toggleMove" })).toBe(inPano);
    expect(reduce(on, { type: "exitMove" }).move).toBe(false);
  });

  it("measure, place and a selection all leave move", () => {
    const moving = { ...INITIAL_VIEWER_MODE, move: true };
    expect(reduce(moving, { type: "toggleMeasure" }).move).toBe(false);
    expect(reduce(moving, { type: "enterPlace" }).move).toBe(false);
    expect(reduce(moving, { type: "select", id: 1 }).move).toBe(false);
  });

  it("the editing target is its own field and survives a view change", () => {
    const editing = reduce(INITIAL_VIEWER_MODE, { type: "startEdit", id: 3 });
    expect(editing.editingPanoramaId).toBe(3);
    expect(reduce(editing, { type: "enterPanorama", id: 3 }).editingPanoramaId).toBe(3);
    expect(reduce(editing, { type: "closeEdit" }).editingPanoramaId).toBeNull();
  });

  it("editing a different capture from inside one walks the reader out first", () => {
    // Inside A, the pencil on B's row: the rig would stand the eye on B's
    // anchor while the sphere still wore A's photograph, and an alignment
    // judged against the wrong picture is saved to B.
    const insideOne = reduce(INITIAL_VIEWER_MODE, { type: "enterPanorama", id: 1 });
    const editingOther = reduce(insideOne, { type: "startEdit", id: 2 });
    expect(editingOther.editingPanoramaId).toBe(2);
    expect(editingOther.view).toEqual({ kind: "scene" });

    // The capture the reader is already in is the coherent case: stay.
    const editingSame = reduce(insideOne, { type: "startEdit", id: 1 });
    expect(editingSame.view).toEqual({ kind: "panorama", id: 1 });
  });

  it("escape peels: move, then the selection, then the mode, then the panorama", () => {
    const esc = { type: "escape", chainOpen: false } as const;
    const all = { ...inPano, move: false, selectedId: 2, mode: "measure" as const };
    const s1 = reduce({ ...INITIAL_VIEWER_MODE, move: true, selectedId: 2 }, esc);
    expect(s1).toMatchObject({ move: false, selectedId: 2 });
    const s2 = reduce(all, esc);
    expect(s2.selectedId).toBeNull();
    const s3 = reduce(s2, esc);
    expect(s3.mode).toBe("orbit");
    const s4 = reduce(s3, esc);
    expect(s4.view).toEqual({ kind: "scene" });
    expect(reduce(s4, esc)).toBe(s4);
  });
});
