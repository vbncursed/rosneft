import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IDENTITY_TRANSFORM,
  setPlacementsGroup,
  setPlacementsHidden,
  type ResolvedPlacement,
} from "@/entities/placement";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useBulkWrites } from "./use-bulk-writes";

vi.mock("@/entities/placement", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setPlacementsHidden: vi.fn(),
  setPlacementsGroup: vi.fn(),
}));

const placement = (id: number, over: Partial<ResolvedPlacement> = {}): ResolvedPlacement => ({
  id,
  territorySlug: "t",
  modelSlug: "tank",
  label: "",
  updatedAt: "t0",
  visiblePanoramaIds: [],
  hidden: false,
  groupId: null,
  chain: [],
  ...IDENTITY_TRANSFORM,
  ...over,
});

let onChanged: ReturnType<typeof vi.fn<() => void>>;
/** Every render's view of the pending state and the placements, in order. */
let renders: { pendingIds: number[]; placements: ResolvedPlacement[] }[];
const mount = (initial: ResolvedPlacement[]) =>
  renderHook(() => {
    const [placements, setPlacements] = useState(initial);
    const writes = useBulkWrites({ slug: "t", setPlacements, onChanged });
    renders.push({ pendingIds: writes.pendingIds, placements });
    return { placements, notices: useNotices(), ...writes };
  });

beforeEach(() => {
  vi.mocked(setPlacementsHidden).mockReset();
  vi.mocked(setPlacementsGroup).mockReset();
  onChanged = vi.fn();
  renders = [];
  clearNotices();
});

describe("useBulkWrites", () => {
  it("hides every id in one write, holds them pending meanwhile, and applies the patch on success", async () => {
    let release!: () => void;
    vi.mocked(setPlacementsHidden).mockReturnValueOnce(new Promise((res) => (release = () => res(2))));
    const { result } = mount([placement(1), placement(2), placement(3)]);

    let done!: Promise<boolean>;
    act(() => {
      done = result.current.setHidden([1, 2], true);
    });
    expect(result.current.pendingIds).toEqual([1, 2]);

    let ok: boolean | undefined;
    await act(async () => {
      release();
      ok = await done;
    });
    expect(ok).toBe(true);
    expect(setPlacementsHidden).toHaveBeenCalledWith("t", [1, 2], true);
    expect(result.current.placements.map((p) => p.hidden)).toEqual([true, true, false]);
    expect(result.current.pendingIds).toEqual([]);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  // The eye is clickable again the moment the pending state clears. Cleared
  // before the patch landed, a click in between read the old `hidden` and
  // sent the value just written — the toggle did nothing.
  it("releases the pending ids in the same render that applies the patch", async () => {
    let release!: () => void;
    vi.mocked(setPlacementsHidden).mockReturnValueOnce(new Promise((res) => (release = () => res(1))));
    const { result } = mount([placement(1)]);
    let done!: Promise<boolean>;
    act(() => {
      done = result.current.setHidden([1], true);
    });
    const pendingAt = renders.length;

    await act(async () => {
      release();
      await done;
    });
    const released = renders.slice(pendingAt).filter((r) => r.pendingIds.length === 0);
    expect(released.map((r) => r.placements[0].hidden)).toEqual([true]);
  });

  it("moves ids into a group, and back to No group with null", async () => {
    vi.mocked(setPlacementsGroup).mockResolvedValue(1);
    const { result } = mount([placement(1), placement(2, { groupId: 4 })]);
    await act(() => result.current.moveToGroup([1], 4));
    expect(result.current.placements.map((p) => p.groupId)).toEqual([4, 4]);
    await act(() => result.current.moveToGroup([2], null));
    expect(setPlacementsGroup).toHaveBeenLastCalledWith("t", [2], null);
    expect(result.current.placements.map((p) => p.groupId)).toEqual([4, null]);
  });

  it("changes nothing on a refusal and says why", async () => {
    vi.mocked(setPlacementsHidden).mockRejectedValue(new HttpError(404, null, "placement not found"));
    const { result } = mount([placement(1)]);
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.setHidden([1], true);
    });
    expect(ok).toBe(false);
    expect(result.current.placements[0].hidden).toBe(false);
    expect(result.current.notices[0]?.message).toBe("placement not found");
    expect(result.current.pendingIds).toEqual([]);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("lets each of two overlapping writes release only its own ids", async () => {
    let releaseHide!: () => void;
    let releaseMove!: () => void;
    vi.mocked(setPlacementsHidden).mockReturnValueOnce(new Promise((res) => (releaseHide = () => res(2))));
    vi.mocked(setPlacementsGroup).mockReturnValueOnce(new Promise((res) => (releaseMove = () => res(1))));
    const { result } = mount([placement(1), placement(2), placement(3)]);
    let hide!: Promise<boolean>;
    let move!: Promise<boolean>;
    act(() => {
      hide = result.current.setHidden([1, 2], true);
      move = result.current.moveToGroup([3], 4);
    });
    expect(result.current.pendingIds).toEqual([1, 2, 3]);
    await act(async () => {
      releaseMove();
      await move;
    });
    expect(result.current.pendingIds).toEqual([1, 2]);
    await act(async () => {
      releaseHide();
      await hide;
    });
    expect(result.current.pendingIds).toEqual([]);
  });

  // Mirrors ON DELETE SET NULL: the server already cleared the column.
  it("ungroups a deleted group's placements locally, and only those", () => {
    const { result } = mount([placement(1, { groupId: 4 }), placement(2, { groupId: 5 })]);
    act(() => result.current.ungroup(4));
    expect(result.current.placements.map((p) => p.groupId)).toEqual([null, 5]);
  });
});
