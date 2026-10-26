import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Calibration, Document } from "@/entities/document";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { usePlanSession, type PlanState } from "./use-plan-session";

const CAL: Calibration = { page: 1, points: [] };
const doc = (id: number, calibration: Calibration | null = null): Document => ({
  id,
  territorySlug: "t",
  title: `plan-${id}.pdf`,
  sourceBlobHash: `h${id}`,
  createdAt: "",
  calibration,
});
const IMAGE = { width: 8, height: 8, close: vi.fn() } as unknown as ImageBitmap;
const STATE: PlanState = {
  image: IMAGE,
  page: { width: 100, height: 50 },
  similarity: { scale: 1, rotation: 0, tx: 0, tz: 0 },
  awaitingScenePick: false,
  preview: null,
};

type Args = { documents: Document[]; canWrite?: boolean };
const session = (args: Args) =>
  renderHook((a: Args) => ({ s: usePlanSession({ canWrite: true, ...a }), notices: useNotices() }), {
    initialProps: args,
  });

beforeEach(() => {
  localStorage.clear();
  clearNotices();
});

describe("usePlanSession, the editor", () => {
  it("opens on a document and closes again", () => {
    const { result } = session({ documents: [doc(1), doc(2)] });
    expect(result.current.s.editing).toBeNull();
    act(() => result.current.s.open(2));
    expect(result.current.s.editing?.id).toBe(2);
    act(() => result.current.s.close());
    expect(result.current.s.editing).toBeNull();
  });

  it("opens nothing for a reader without zone:write, or for a document that is not there", () => {
    const reader = session({ documents: [doc(1)], canWrite: false });
    act(() => reader.result.current.s.open(1));
    expect(reader.result.current.s.editing).toBeNull();
    const writer = session({ documents: [doc(1)] });
    act(() => writer.result.current.s.open(9));
    expect(writer.result.current.s.editing).toBeNull();
  });

  it("draws the plan the editor published while it is open, and no longer once it is closed", () => {
    const { result } = session({ documents: [doc(1)] });
    act(() => result.current.s.open(1));
    act(() => result.current.s.onPlan(STATE));
    expect(result.current.s.canvasPlan?.fit).toEqual({ similarity: STATE.similarity, page: STATE.page });
    act(() => result.current.s.close());
    expect(result.current.s.canvasPlan).toBeNull();
  });

  it("draws nothing while the fit is not good", () => {
    const { result } = session({ documents: [doc(1)] });
    act(() => result.current.s.open(1));
    act(() => result.current.s.onPlan({ ...STATE, similarity: null }));
    expect(result.current.s.canvasPlan).toBeNull();
  });

  it("asks for a scene point only while the editor is waiting for one", () => {
    const { result } = session({ documents: [doc(1)] });
    expect(result.current.s.pickScene).toBe(false);
    act(() => result.current.s.open(1));
    act(() => result.current.s.onPlan({ ...STATE, awaitingScenePick: true }));
    expect(result.current.s.pickScene).toBe(true);
    act(() => result.current.s.onPlan({ ...STATE, awaitingScenePick: false }));
    expect(result.current.s.pickScene).toBe(false);
  });

  it("keeps the same canvas plan across publishes of the same picture and fit", () => {
    const { result } = session({ documents: [doc(1)] });
    act(() => result.current.s.open(1));
    act(() => result.current.s.onPlan(STATE));
    const first = result.current.s.canvasPlan;
    act(() => result.current.s.onPlan({ ...STATE, similarity: { ...STATE.similarity! } }));
    expect(result.current.s.canvasPlan).toBe(first);
  });
});

describe("usePlanSession, the candidate squares", () => {
  const PREVIEW = {
    outlines: [{ index: 0, corners: [0, 1, 2, 3].map((x) => ({ x, y: 0, z: 0 })) as never }],
    selected: null,
    label: null,
    onSelect: vi.fn(),
  };

  it("passes the editor's preview on while it is open, and withdraws it with the editor", () => {
    const { result } = session({ documents: [doc(1)] });
    act(() => result.current.s.open(1));
    act(() => result.current.s.onPlan({ ...STATE, preview: PREVIEW }));
    expect(result.current.s.preview).toBe(PREVIEW);
    act(() => result.current.s.close());
    expect(result.current.s.preview).toBeNull();
  });

  it("keeps the very same preview across republishes of the same one", () => {
    const { result } = session({ documents: [doc(1)] });
    act(() => result.current.s.open(1));
    act(() => result.current.s.onPlan({ ...STATE, preview: PREVIEW }));
    act(() => result.current.s.onPlan({ ...STATE, awaitingScenePick: true, preview: PREVIEW }));
    expect(result.current.s.preview).toBe(PREVIEW);
  });

  it("shows none for the saved plan that Show plan draws", () => {
    const { result } = session({ documents: [doc(1, CAL)] });
    act(() => result.current.s.onPlan({ ...STATE, preview: PREVIEW }));
    expect(result.current.s.preview).toBeNull();
  });
});

describe("usePlanSession, a plan that disappears while it is open", () => {
  const openOn = (documents: Document[]) => {
    const hook = session({ documents });
    act(() => hook.result.current.s.open(1));
    act(() => hook.result.current.s.onPlan(STATE));
    return hook;
  };

  it("closes the panel and unmounts the overlay when the document is gone", () => {
    const { result, rerender } = openOn([doc(1, CAL), doc(2)]);
    rerender({ documents: [doc(2)] });
    expect(result.current.s.editing).toBeNull();
    expect(result.current.s.canvasPlan).toBeNull();
    expect(result.current.notices.map((n) => n.message)).toEqual(["The plan was removed."]);
    expect(result.current.notices[0].tone).toBe("info");
  });

  it("does the same when only its calibration is gone", () => {
    const { result, rerender } = openOn([doc(1, CAL)]);
    rerender({ documents: [doc(1, null)] });
    expect(result.current.s.editing).toBeNull();
    expect(result.current.s.canvasPlan).toBeNull();
    expect(result.current.notices.map((n) => n.message)).toEqual(["The plan was removed."]);
  });

  it("says it once, and stays closed", () => {
    const { result, rerender } = openOn([doc(1, CAL)]);
    rerender({ documents: [] });
    rerender({ documents: [] });
    expect(result.current.notices).toHaveLength(1);
  });

  it("leaves a plan that was never aligned open: it has no calibration to lose", () => {
    const { result, rerender } = openOn([doc(1)]);
    rerender({ documents: [doc(1)] });
    expect(result.current.s.editing?.id).toBe(1);
    expect(result.current.notices).toHaveLength(0);
  });

  it("does not take the reader's own Clear alignment for a removal", () => {
    const { result, rerender } = openOn([doc(1, CAL)]);
    act(() => result.current.s.onCalibrated(null));
    rerender({ documents: [doc(1, null)] });
    expect(result.current.s.editing?.id).toBe(1);
    expect(result.current.notices).toHaveLength(0);
  });

  it("does take a removal after the reader's own save", () => {
    const { result, rerender } = openOn([doc(1)]);
    act(() => result.current.s.onCalibrated(CAL));
    rerender({ documents: [doc(1, CAL)] });
    rerender({ documents: [doc(1, null)] });
    expect(result.current.s.editing).toBeNull();
    expect(result.current.notices).toHaveLength(1);
  });
});

describe("usePlanSession, Show plan", () => {
  it("offers the first aligned document, and has none to offer when nothing is aligned", () => {
    expect(session({ documents: [doc(1), doc(2, CAL), doc(3, CAL)] }).result.current.s.saved?.id).toBe(2);
    expect(session({ documents: [doc(1)] }).result.current.s.saved).toBeNull();
  });

  it("is off until the reader switches it on, and remembers the choice", () => {
    const first = session({ documents: [doc(1, CAL)] });
    expect(first.result.current.s.showPlan).toBe(false);
    act(() => first.result.current.s.toggleShowPlan());
    expect(first.result.current.s.showPlan).toBe(true);
    expect(localStorage.getItem("andrey.plan")).toBe("shown");
    first.unmount();
    expect(session({ documents: [doc(1, CAL)] }).result.current.s.showPlan).toBe(true);
  });

  it("draws the saved plan when it is on, and not when it is off", () => {
    const { result } = session({ documents: [doc(1, CAL)] });
    act(() => result.current.s.onPlan(STATE));
    expect(result.current.s.canvasPlan).toBeNull();
    act(() => result.current.s.toggleShowPlan());
    expect(result.current.s.canvasPlan).not.toBeNull();
  });

  it("does not draw a plan nothing aligned stands behind", () => {
    const { result } = session({ documents: [doc(1)] });
    act(() => result.current.s.toggleShowPlan());
    act(() => result.current.s.onPlan(STATE));
    expect(result.current.s.canvasPlan).toBeNull();
  });

  it("drops the picture as soon as the aligned document goes or changes, so it never wears another's fit", () => {
    const { result, rerender } = session({ documents: [doc(1, CAL)] });
    act(() => result.current.s.toggleShowPlan());
    act(() => result.current.s.onPlan(STATE));
    expect(result.current.s.canvasPlan).not.toBeNull();

    rerender({ documents: [doc(2, CAL)] });
    expect(result.current.s.plan).toBeNull();
    act(() => result.current.s.onPlan(STATE));
    rerender({ documents: [doc(2, { page: 2, points: [] })] });
    expect(result.current.s.plan).toBeNull();
    act(() => result.current.s.onPlan(STATE));
    rerender({ documents: [doc(2)] });
    expect(result.current.s.plan).toBeNull();
  });

  it("keeps the picture when only the saved points change", () => {
    const { result, rerender } = session({ documents: [doc(1, CAL)] });
    act(() => result.current.s.onPlan(STATE));
    rerender({
      documents: [doc(1, { ...CAL, points: [{ pdf: { x: 1, y: 1 }, scene: { x: 0, y: 0, z: 0 }, utm: null }] })],
    });
    expect(result.current.s.plan).toBe(STATE);
  });

  it("starts at 60 % and takes a new opacity", () => {
    const { result } = session({ documents: [doc(1, CAL)] });
    expect(result.current.s.opacity).toBe(0.6);
    act(() => result.current.s.setOpacity(0.3));
    expect(result.current.s.opacity).toBe(0.3);
  });
});
