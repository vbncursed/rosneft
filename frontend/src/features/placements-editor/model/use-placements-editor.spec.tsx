import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlacements,
  deletePlacement,
  setPlacementVisibility,
  updatePlacement,
  IDENTITY_TRANSFORM,
  type Placement,
} from "@/entities/placement";
import type { ModelOption } from "@/entities/scene";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { usePlacementsEditor } from "./use-placements-editor";

vi.mock("@/entities/placement", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createPlacements: vi.fn(),
  updatePlacement: vi.fn(),
  deletePlacement: vi.fn(),
  setPlacementVisibility: vi.fn(),
}));

const CHAIN = [{ lod: 0, hash: "h0", size: 30 }];
// bbox 4 long against a 40 m territory — a real-world scale of exactly 0.1.
const options: ModelOption[] = [
  {
    slug: "tank",
    title: "storage-tank-500",
    bboxMin: { x: 0, y: 0, z: 0 },
    bboxMax: { x: 4, y: 2, z: 1 },
    chain: CHAIN,
  },
];

const placement = (id: number, over: Partial<Placement> = {}): Placement => ({
  id,
  territorySlug: "t",
  modelSlug: "tank",
  label: "",
  updatedAt: "t0",
  visiblePanoramaIds: [],
  ...IDENTITY_TRANSFORM,
  ...over,
});

const resolved = (p: Placement) => ({ ...p, chain: CHAIN });

let onChanged: ReturnType<typeof vi.fn<() => void>>;
const editor = (initial: Placement[] = [], panoramaIds: number[] = []) =>
  renderHook(() => ({
    s: usePlacementsEditor({
      slug: "t",
      initial: initial.map(resolved),
      options,
      territoryMaxDim: 40,
      panoramaIds,
      onChanged,
    }),
    notices: useNotices(),
  }));

beforeEach(() => {
  vi.mocked(createPlacements).mockReset();
  vi.mocked(updatePlacement).mockReset();
  vi.mocked(deletePlacement).mockReset();
  vi.mocked(setPlacementVisibility).mockReset();
  onChanged = vi.fn();
  clearNotices();
});

describe("usePlacementsEditor", () => {
  it("creates N instances in one batch, in a row along X at the real-world scale, and resolves to the last id", async () => {
    vi.mocked(createPlacements).mockImplementation(async (_slug, items) =>
      items.map((body, i) => ({ ...placement(100 + i), ...body }) as Placement),
    );
    const { result } = editor();

    let last: number | null = null;
    await act(async () => {
      last = await result.current.s.create("tank", 2);
    });

    expect(createPlacements).toHaveBeenCalledOnce();
    const items = vi.mocked(createPlacements).mock.calls[0][1];
    expect(items[0].position?.x).toBe(0);
    // 2 scene units per GLB times the 0.1 scale, plus a tenth for the gap.
    expect(items[1].position?.x).toBeCloseTo(0.22, 10);
    expect(items[0].scale).toEqual({ x: 0.1, y: 0.1, z: 0.1 });
    expect(result.current.s.placements).toHaveLength(2);
    expect(result.current.s.placements[0].chain).toEqual(CHAIN);
    expect(last).toBe(101);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("exposes placing progress while the batch is in flight", async () => {
    let release!: () => void;
    vi.mocked(createPlacements).mockImplementationOnce(
      () => new Promise<Placement[]>((res) => (release = () => res([placement(1), placement(2)]))),
    );
    const { result } = editor();

    let done!: Promise<number | null>;
    act(() => {
      done = result.current.s.create("tank", 2);
    });
    await waitFor(() => expect(result.current.s.placing).toEqual({ total: 2 }));

    await act(async () => {
      release();
      await done;
    });
    expect(result.current.s.placing).toBeNull();
  });

  // One transaction on the gateway: a refused batch created nothing.
  it("a refused batch toasts and leaves the list as it was", async () => {
    vi.mocked(createPlacements).mockRejectedValue(new HttpError(403, null, "You don't have permission to do this"));
    const { result } = editor([placement(1)]);

    let out: number | null = 7;
    await act(async () => {
      out = await result.current.s.create("tank", 2);
    });

    expect(out).toBeNull();
    expect(result.current.s.placements.map((p) => p.id)).toEqual([1]);
    expect(result.current.s.placing).toBeNull();
    expect(result.current.notices[0]?.message).toBe("You don't have permission to do this");
    expect(onChanged).not.toHaveBeenCalled();
  });

  // No HTTP answer means the gateway may have committed before the line
  // dropped: the list stays as it was, but the bundle is marked stale so the
  // next visit shows whatever really landed.
  it("a batch lost to the network toasts and still marks the bundle stale", async () => {
    vi.mocked(createPlacements).mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = editor([placement(1)]);

    let out: number | null = 7;
    await act(async () => {
      out = await result.current.s.create("tank", 2);
    });

    expect(out).toBeNull();
    expect(result.current.s.placements.map((p) => p.id)).toEqual([1]);
    expect(result.current.notices).toHaveLength(1);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("commitTransform keeps the label; rename keeps the transform", async () => {
    vi.mocked(updatePlacement).mockImplementation(async (_slug, id, body) => ({ ...placement(id), ...body }));
    const { result } = editor([placement(1, { label: "Tank 4" })]);
    const moved = { position: { x: 9, y: 0, z: 0 }, rotation: { x: 0, y: 1.5, z: 0 }, scale: { x: 2, y: 2, z: 2 } };

    await act(async () => await result.current.s.commitTransform(1, moved));
    expect(vi.mocked(updatePlacement).mock.calls[0][2]).toEqual({ ...moved, label: "Tank 4" });

    await act(async () => await result.current.s.rename(1, "Tank 5"));
    // The transform read back is the one the drag just committed, not the initial one.
    expect(vi.mocked(updatePlacement).mock.calls[1][2]).toEqual({ ...moved, label: "Tank 5" });
    expect(result.current.s.placements[0].label).toBe("Tank 5");
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("create sends visiblePanoramaIds from the editor's panoramaIds param", async () => {
    vi.mocked(createPlacements).mockImplementation(async (_slug, items) =>
      items.map((body) => ({ ...placement(1), ...body }) as Placement),
    );
    const { result } = editor([], [1, 2]);

    await act(async () => {
      await result.current.s.create("tank", 1);
    });

    expect(vi.mocked(createPlacements).mock.calls[0][1][0].visiblePanoramaIds).toEqual([1, 2]);
  });

  it("create sends an empty visiblePanoramaIds when none are given", async () => {
    vi.mocked(createPlacements).mockImplementation(async (_slug, items) =>
      items.map((body) => ({ ...placement(1), ...body }) as Placement),
    );
    const { result } = editor([], []);

    await act(async () => {
      await result.current.s.create("tank", 1);
    });

    expect(vi.mocked(createPlacements).mock.calls[0][1][0].visiblePanoramaIds).toEqual([]);
  });

  it("setVisibility PUTs the allowlist, swaps the row in and calls onChanged", async () => {
    vi.mocked(setPlacementVisibility).mockResolvedValue({
      ...placement(5),
      visiblePanoramaIds: [1],
    });
    const { result } = editor([placement(5)]);

    await act(async () => await result.current.s.setVisibility(5, [1]));

    expect(setPlacementVisibility).toHaveBeenCalledWith("t", 5, [1]);
    expect(result.current.s.placements[0].visiblePanoramaIds).toEqual([1]);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("marks the placement pending while setVisibility is in flight", async () => {
    let release!: () => void;
    vi.mocked(setPlacementVisibility).mockImplementation(
      () => new Promise((res) => (release = () => res(placement(5)))),
    );
    const { result } = editor([placement(5)]);

    let done!: Promise<void>;
    act(() => {
      done = result.current.s.setVisibility(5, [1]);
    });
    await waitFor(() => expect(result.current.s.pendingIds).toEqual([5]));

    await act(async () => {
      release();
      await done;
    });
    expect(result.current.s.pendingIds).toEqual([]);
  });

  it("a refused setVisibility toasts and leaves the row", async () => {
    vi.mocked(setPlacementVisibility).mockRejectedValue(
      new HttpError(403, null, "You don't have permission to do this"),
    );
    const { result } = editor([placement(5)]);

    await act(async () => await result.current.s.setVisibility(5, [1]));

    expect(result.current.s.placements[0].visiblePanoramaIds).toEqual([]);
    expect(result.current.notices[0]?.message).toBe("You don't have permission to do this");
  });

  it("remove drops the row and clears its pending mark", async () => {
    let release!: () => void;
    vi.mocked(deletePlacement).mockImplementation(
      () => new Promise<void>((res) => (release = () => res())),
    );
    const { result } = editor([placement(1), placement(2)]);

    let done!: Promise<void>;
    act(() => {
      done = result.current.s.remove(2);
    });
    await waitFor(() => expect(result.current.s.pendingIds).toEqual([2]));

    await act(async () => {
      release();
      await done;
    });
    expect(result.current.s.placements.map((p) => p.id)).toEqual([1]);
    expect(result.current.s.pendingIds).toEqual([]);
    expect(onChanged).toHaveBeenCalledOnce();
  });
});
