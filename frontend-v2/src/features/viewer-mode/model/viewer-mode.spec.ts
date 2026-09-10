import { describe, expect, it } from "vitest";
import { INITIAL_VIEWER_MODE, viewerModeReducer as reduce, type ViewerModeState } from "./viewer-mode";

const selected: ViewerModeState = { ...INITIAL_VIEWER_MODE, selectedId: 7 };
const measuring: ViewerModeState = { ...INITIAL_VIEWER_MODE, mode: "measure" };

describe("viewerModeReducer", () => {
  it("starts in orbit with nothing selected, translate, snap off", () => {
    expect(INITIAL_VIEWER_MODE).toEqual({ mode: "orbit", selectedId: null, gizmo: "translate", snap: false });
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
