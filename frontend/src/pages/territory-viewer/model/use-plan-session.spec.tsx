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

  it("asks for a scene point only while the editor is waiting for one", () => {
    const { result } = session({ documents: [doc(1)] });
    expect(result.current.s.pickScene).toBe(false);
    act(() => result.current.s.open(1));
    act(() => result.current.s.onPlan({ ...STATE, awaitingScenePick: true }));
    expect(result.current.s.pickScene).toBe(true);
    act(() => result.current.s.onPlan({ ...STATE, awaitingScenePick: false }));
    expect(result.current.s.pickScene).toBe(false);
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

  it("shows none while no editor is open, whatever a stale publish says", () => {
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

  it("closes the panel and the editor when the document is gone", () => {
    const { result, rerender } = openOn([doc(1, CAL), doc(2)]);
    rerender({ documents: [doc(2)] });
    expect(result.current.s.editing).toBeNull();
    expect(result.current.notices.map((n) => n.message)).toEqual(["The plan was removed."]);
    expect(result.current.notices[0].tone).toBe("info");
  });

  it("does the same when only its calibration is gone", () => {
    const { result, rerender } = openOn([doc(1, CAL)]);
    rerender({ documents: [doc(1, null)] });
    expect(result.current.s.editing).toBeNull();
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
