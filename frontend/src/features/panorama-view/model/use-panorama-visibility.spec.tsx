import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_PHASES_SHOWN,
  setPanoramaPhaseHidden,
  setPanoramasHidden,
  setPanoramasPhase,
  type Panorama,
} from "@/entities/panorama";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { usePanoramaVisibility } from "./use-panorama-visibility";

vi.mock("@/entities/panorama", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  setPanoramasHidden: vi.fn(),
  setPanoramasPhase: vi.fn(),
  setPanoramaPhaseHidden: vi.fn(),
}));

const panorama = (id: number, over: Partial<Panorama> = {}): Panorama => ({
  id,
  territorySlug: "t",
  slug: `p${id}`,
  title: `Point ${id}`,
  sourceBlobHash: `h${id}`,
  position: { x: 1, y: 2, z: 3 },
  yawOffset: 0,
  defaultYaw: 0,
  thumbnailBlobHash: null,
  updatedAt: "t0",
  phase: "prior",
  hidden: false,
  ...over,
});

let onChanged: ReturnType<typeof vi.fn<() => void>>;
/** Every render's view of the pending ids and the list, in order. */
let renders: { pendingIds: number[]; panoramas: Panorama[] }[];
const mount = (initial: Panorama[]) =>
  renderHook(() => {
    const [panoramas, setPanoramas] = useState(initial);
    const v = usePanoramaVisibility({ slug: "t", setPanoramas, initialPhaseHidden: ALL_PHASES_SHOWN, onChanged });
    renders.push({ pendingIds: v.pendingIds, panoramas });
    return { panoramas, notices: useNotices(), ...v };
  });

beforeEach(() => {
  vi.mocked(setPanoramasHidden).mockReset();
  vi.mocked(setPanoramasPhase).mockReset();
  vi.mocked(setPanoramaPhaseHidden).mockReset();
  onChanged = vi.fn();
  renders = [];
  clearNotices();
});

describe("usePanoramaVisibility", () => {
  it("hides every id in one write, holds them pending meanwhile, and applies the flag on success", async () => {
    let release!: () => void;
    vi.mocked(setPanoramasHidden).mockReturnValueOnce(new Promise((res) => (release = () => res(2))));
    const { result } = mount([panorama(1), panorama(2), panorama(3)]);
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
    expect(setPanoramasHidden).toHaveBeenCalledWith("t", [1, 2], true);
    expect(result.current.panoramas.map((p) => p.hidden)).toEqual([true, true, false]);
    expect(result.current.pendingIds).toEqual([]);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  // Released a render before the flag landed, the eye was clickable while it
  // still read the old value, and a click sent the value just written.
  it("releases the pending ids in the same render that applies the flag", async () => {
    let release!: () => void;
    vi.mocked(setPanoramasHidden).mockReturnValueOnce(new Promise((res) => (release = () => res(1))));
    const { result } = mount([panorama(1)]);
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
    expect(released.map((r) => r.panoramas[0].hidden)).toEqual([true]);
  });

  it("moves ids into another phase and applies it on success", async () => {
    vi.mocked(setPanoramasPhase).mockResolvedValue(1);
    const { result } = mount([panorama(1), panorama(2)]);
    await act(() => result.current.moveToPhase([2], "post"));
    expect(setPanoramasPhase).toHaveBeenCalledWith("t", [2], "post");
    expect(result.current.panoramas.map((p) => p.phase)).toEqual(["prior", "post"]);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("changes nothing on a refusal, says why, and marks nothing stale", async () => {
    vi.mocked(setPanoramasHidden).mockRejectedValue(new HttpError(404, null, "panorama not found"));
    const { result } = mount([panorama(1)]);
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.setHidden([1], true);
    });
    expect(ok).toBe(false);
    expect(result.current.panoramas[0].hidden).toBe(false);
    expect(result.current.notices[0]?.message).toBe("panorama not found");
    expect(result.current.pendingIds).toEqual([]);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("lets each of two overlapping writes release only its own ids", async () => {
    let releaseHide!: () => void;
    let releaseMove!: () => void;
    vi.mocked(setPanoramasHidden).mockReturnValueOnce(new Promise((res) => (releaseHide = () => res(2))));
    vi.mocked(setPanoramasPhase).mockReturnValueOnce(new Promise((res) => (releaseMove = () => res(1))));
    const { result } = mount([panorama(1), panorama(2), panorama(3)]);
    let hide!: Promise<boolean>;
    let move!: Promise<boolean>;
    act(() => {
      hide = result.current.setHidden([1, 2], true);
      move = result.current.moveToPhase([3], "current");
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

  it("sets a phase's own flag from the server's answer, waiting on that phase meanwhile", async () => {
    let release!: () => void;
    vi.mocked(setPanoramaPhaseHidden).mockReturnValueOnce(new Promise((res) => (release = () => res(true))));
    const { result } = mount([panorama(1, { phase: "current" })]);
    let done!: Promise<boolean>;
    act(() => {
      done = result.current.setPhaseHidden("current", true);
    });
    expect(result.current.pendingPhases).toEqual(["current"]);
    await act(async () => {
      release();
      await done;
    });
    expect(setPanoramaPhaseHidden).toHaveBeenCalledWith("t", "current", true);
    expect(result.current.phaseHidden).toEqual({ ...ALL_PHASES_SHOWN, current: true });
    expect(result.current.pendingPhases).toEqual([]);
    // D5: the flag is the phase's; no panorama's own flag moved.
    expect(result.current.panoramas[0].hidden).toBe(false);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("keeps a phase's flag on a refusal and says why", async () => {
    vi.mocked(setPanoramaPhaseHidden).mockRejectedValue(new HttpError(400, null, "invalid input: unknown phase"));
    const { result } = mount([panorama(1)]);
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.setPhaseHidden("post", true);
    });
    expect(ok).toBe(false);
    expect(result.current.phaseHidden).toEqual(ALL_PHASES_SHOWN);
    expect(result.current.notices[0]?.message).toBe("invalid input: unknown phase");
    expect(result.current.pendingPhases).toEqual([]);
    expect(onChanged).not.toHaveBeenCalled();
  });
});
