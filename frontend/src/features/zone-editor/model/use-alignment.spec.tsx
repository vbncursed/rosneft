import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteCalibration, putCalibration, type Document } from "@/entities/document";
import { controlPoints, type CalibrationPair, type ControlPoint } from "@/entities/site-plan";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import plan from "../../../entities/site-plan/model/__data__/mr1-plan.json";
import { UNIT_RATIO, UTM_BBOX } from "./plan-pdf.fixture";
import { useAlignment } from "./use-alignment";

vi.mock("@/entities/document", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  putCalibration: vi.fn(),
  deleteCalibration: vi.fn(),
}));

const MR1 = controlPoints(plan.text, plan.viewport);
// A plan at exactly 6 pt/m over a 200 m model (100 m per scene unit).
const BBOX = { min: { x: 499900, y: -5, z: -100 }, max: { x: 500100, y: 5, z: 100 } };
const cp = (label: string, x: number, y: number, e: number, n: number): ControlPoint => ({
  label,
  at: { x, y },
  e,
  n,
});
const EXACT: ControlPoint[] = [cp("A", 0, 0, 500000, 0), cp("B", 600, 0, 500100, 0), cp("C", 0, 600, 500000, -100)];

const doc = (calibration: Document["calibration"] = null): Document => ({
  id: 4,
  territorySlug: "t",
  title: "plan.pdf",
  sourceBlobHash: "h4",
  createdAt: "t0",
  calibration,
});

type Args = Partial<Parameters<typeof useAlignment>[0]>;
let onChanged: ReturnType<typeof vi.fn<() => void>>;
const align = (args: Args = {}) =>
  renderHook(
    (over: Args) =>
      Object.assign(
        useAlignment({
          slug: "t",
          document: doc(),
          plan: { page: 1, controls: EXACT },
          bbox: BBOX,
          unitRatio: 100,
          groundAt: () => 0,
          fallbackY: 0.5,
          onChanged,
          ...over,
        }),
        { notices: useNotices() },
      ),
    { initialProps: args },
  );

const pickPair = (r: ReturnType<typeof align>["result"], pdf: [number, number], scene: [number, number]) => {
  act(() => r.current.addPlanPoint({ x: pdf[0], y: pdf[1] }));
  act(() => r.current.acceptScenePoint({ x: scene[0], y: 0, z: scene[1] }));
};

beforeEach(() => {
  onChanged = vi.fn();
  vi.mocked(putCalibration).mockReset();
  vi.mocked(deleteCalibration).mockReset();
  clearNotices();
});

describe("useAlignment, automatic", () => {
  it("proposes a pair per survey label that falls on the model and fits them", () => {
    const { result } = align({ plan: { page: 1, controls: MR1 }, bbox: UTM_BBOX, unitRatio: UNIT_RATIO });
    expect(result.current.pairs).toHaveLength(4);
    expect(result.current.fit?.ok).toBe(true);
    expect(result.current.residualsM).toHaveLength(4);
    expect(result.current.residualsM.every((r) => Number.isFinite(r) && r >= 0)).toBe(true);
    expect(result.current.fitLine).toBeNull();
    expect(result.current.notice).toBeNull();
    expect(result.current.canSave).toBe(true);
  });

  it("reads the model's size against the drawing's", () => {
    const { result } = align({ unitRatio: 101.2 });
    expect(result.current.scaleLine).toBe("Model is 1.2 % larger than the drawing");
    expect(result.current.scaleWarn).toBe(false);
  });

  it("warns, in words, past 3 %", () => {
    const { result } = align({ unitRatio: 105 });
    expect(result.current.scaleLine).toBe("Model is 5.0 % larger than the drawing. Check that the points match.");
    expect(result.current.scaleWarn).toBe(true);
  });

  it("converts residuals from scene units to metres", () => {
    const moved = [{ ...EXACT[0], at: { x: 3, y: 0 } }, EXACT[1], EXACT[2]];
    const { result } = align({ plan: { page: 1, controls: moved } });
    expect(Math.max(...result.current.residualsM)).toBeGreaterThan(0.1);
    expect(Math.max(...result.current.residualsM)).toBeLessThan(2);
  });
});

describe("useAlignment, manual", () => {
  it("says so and starts empty when the plan is not on this model", () => {
    const far = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
    for (const bbox of [far, null]) {
      const { result } = align({ bbox });
      expect(result.current.pairs).toEqual([]);
      expect(result.current.notice).toBe("This plan's coordinates do not fall on this model");
      expect(result.current.fit).toBeNull();
      expect(result.current.canSave).toBe(false);
    }
  });

  it("says when the page has no survey labels at all", () => {
    const { result } = align({ plan: { page: 1, controls: [] } });
    expect(result.current.notice).toBe("No survey labels on this page. Add point pairs by hand.");
  });

  it("adds a pair from a plan click and then a scene point", () => {
    const { result } = align({ bbox: null });
    act(() => result.current.addPlanPoint({ x: 10, y: 20 }));
    expect(result.current.awaitingScenePick).toBe(true);
    act(() => result.current.acceptScenePoint({ x: 1, y: 2, z: 3 }));
    expect(result.current.awaitingScenePick).toBe(false);
    expect(result.current.pairs).toEqual([{ pdf: { x: 10, y: 20 }, scene: { x: 1, y: 2, z: 3 }, utm: null }]);
  });

  it("ignores a scene point nobody asked for, and a cancelled pick", () => {
    const { result } = align({ bbox: null });
    act(() => result.current.acceptScenePoint({ x: 1, y: 2, z: 3 }));
    expect(result.current.pairs).toEqual([]);
    act(() => result.current.addPlanPoint({ x: 1, y: 1 }));
    act(() => result.current.cancelPending());
    expect(result.current.awaitingScenePick).toBe(false);
  });

  it("fits two pairs exactly and says so", () => {
    const { result } = align({ bbox: null });
    pickPair(result, [0, 0], [0, 0]);
    expect(result.current.error).toBe("Add at least two point pairs.");
    pickPair(result, [100, 0], [1, 0]);
    expect(result.current.fit?.ok).toBe(true);
    expect(result.current.fitLine).toBe("Exact fit with two points");
    expect(result.current.canSave).toBe(true);
  });

  it("refuses a mirrored fit with the reason, and cannot save it", () => {
    const { result } = align({ bbox: null });
    pickPair(result, [100, 100], [0, 0]);
    pickPair(result, [200, 100], [1, 0]);
    pickPair(result, [100, 200], [0, -1]);
    expect(result.current.error).toMatch(/^These points are mirrored relative to the model/);
    expect(result.current.canSave).toBe(false);
  });

  it("refits when a pair's plan point is dragged", () => {
    const { result } = align();
    const before = result.current.residualsM;
    act(() => result.current.movePair(0, { x: 40, y: 40 }));
    expect(result.current.pairs[0].pdf).toEqual({ x: 40, y: 40 });
    expect(result.current.residualsM).not.toEqual(before);
  });

  it("drops a pair", () => {
    const { result } = align();
    act(() => result.current.removePair(0));
    expect(result.current.pairs).toHaveLength(2);
  });

  it("stops adding at the server's limit of 20", () => {
    const { result } = align({ bbox: null });
    for (let i = 0; i < 21; i++) pickPair(result, [i * 10, i * 3], [i, i * 2]);
    expect(result.current.pairs).toHaveLength(20);
  });
});

describe("useAlignment, pages and saved sets", () => {
  const saved: CalibrationPair[] = [
    { pdf: { x: 0, y: 0 }, scene: { x: 0, y: 0, z: 0 }, utm: null },
    { pdf: { x: 100, y: 0 }, scene: { x: 1, y: 0, z: 0 }, utm: null },
  ];

  it("starts from the saved set on its own page", () => {
    const { result } = align({ document: doc({ page: 1, points: saved }) });
    expect(result.current.pairs).toEqual(saved);
  });

  it("drops the pairs when the page changes, and re-proposes on the new page's labels", () => {
    const { result, rerender } = align({ document: doc({ page: 1, points: saved }), bbox: null });
    pickPair(result, [5, 5], [2, 2]);
    expect(result.current.pairs).toHaveLength(3);
    rerender({ document: doc({ page: 1, points: saved }), bbox: null, plan: { page: 2, controls: null } });
    expect(result.current.pairs).toEqual([]);
    rerender({ document: doc({ page: 1, points: saved }), bbox: null, plan: { page: 2, controls: [] } });
    expect(result.current.pairs).toEqual([]);
  });
});

describe("useAlignment, save and clear", () => {
  it("PUTs every pair with the page, then reports", async () => {
    vi.mocked(putCalibration).mockResolvedValue({ page: 2, points: [] });
    const { result } = align({ plan: { page: 2, controls: EXACT } });
    await act(() => result.current.save());
    expect(putCalibration).toHaveBeenCalledWith("t", 4, { page: 2, points: result.current.pairs });
    expect(result.current.pairs).toHaveLength(3);
    expect(onChanged).toHaveBeenCalledOnce();
    expect(result.current.notices[0]).toMatchObject({ tone: "success", message: "Alignment saved" });
  });

  it("reports a refusal and does not call onChanged", async () => {
    vi.mocked(putCalibration).mockRejectedValue(new HttpError(400, null, "points must lie on one page"));
    const { result } = align();
    await act(() => result.current.save());
    expect(onChanged).not.toHaveBeenCalled();
    expect(result.current.notices[0]).toMatchObject({ tone: "error", message: "points must lie on one page" });
    expect(result.current.saving).toBe(false);
  });

  it("does not save a fit it refuses", async () => {
    const { result } = align({ bbox: null });
    await act(() => result.current.save());
    expect(putCalibration).not.toHaveBeenCalled();
  });

  it("clears the pairs, and deletes the saved set when there is one", async () => {
    vi.mocked(deleteCalibration).mockResolvedValue();
    const { result } = align({ document: doc({ page: 1, points: [] }) });
    await act(() => result.current.clear());
    expect(deleteCalibration).toHaveBeenCalledWith("t", 4);
    expect(result.current.pairs).toEqual([]);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("only empties the pairs when nothing was saved", async () => {
    const { result } = align();
    await act(() => result.current.clear());
    expect(deleteCalibration).not.toHaveBeenCalled();
    expect(result.current.pairs).toEqual([]);
  });
});
