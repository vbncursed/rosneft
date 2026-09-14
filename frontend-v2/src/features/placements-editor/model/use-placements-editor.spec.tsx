import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlacement,
  deletePlacement,
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
  createPlacement: vi.fn(),
  updatePlacement: vi.fn(),
  deletePlacement: vi.fn(),
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
const editor = (initial: Placement[] = []) =>
  renderHook(() => ({
    s: usePlacementsEditor({ slug: "t", initial: initial.map(resolved), options, territoryMaxDim: 40, onChanged }),
    notices: useNotices(),
  }));

beforeEach(() => {
  vi.mocked(createPlacement).mockReset();
  vi.mocked(updatePlacement).mockReset();
  vi.mocked(deletePlacement).mockReset();
  onChanged = vi.fn();
  clearNotices();
});

describe("usePlacementsEditor", () => {
  it("creates N instances in a row along X at the real-world scale and resolves to the last id", async () => {
    let next = 100;
    vi.mocked(createPlacement).mockImplementation(async (_slug, body) => ({
      ...placement(next++),
      ...body,
    }) as Placement);
    const { result } = editor();

    let last: number | null = null;
    await act(async () => {
      last = await result.current.s.create("tank", 2);
    });

    const xs = vi.mocked(createPlacement).mock.calls.map(([, b]) => b.position?.x ?? 0);
    expect(xs[0]).toBe(0);
    // 2 scene units per GLB times the 0.1 scale, plus a tenth for the gap.
    expect(xs[1]).toBeCloseTo(0.22, 10);
    expect(vi.mocked(createPlacement).mock.calls[0][1].scale).toEqual({ x: 0.1, y: 0.1, z: 0.1 });
    expect(result.current.s.placements).toHaveLength(2);
    expect(result.current.s.placements[0].chain).toEqual(CHAIN);
    expect(last).toBe(result.current.s.placements[1].id);
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("exposes placing progress while the loop runs", async () => {
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    vi.mocked(createPlacement)
      .mockImplementationOnce(
        () => new Promise<Placement>((res) => (releaseFirst = () => res(placement(1)))),
      )
      .mockImplementationOnce(
        () => new Promise<Placement>((res) => (releaseSecond = () => res(placement(2)))),
      );
    const { result } = editor();

    let done!: Promise<number | null>;
    act(() => {
      done = result.current.s.create("tank", 2);
    });
    await waitFor(() => expect(result.current.s.placing).toEqual({ done: 0, total: 2 }));

    await act(async () => releaseFirst());
    await waitFor(() => expect(result.current.s.placing).toEqual({ done: 1, total: 2 }));

    await act(async () => {
      releaseSecond();
      await done;
    });
    expect(result.current.s.placing).toBeNull();
  });

  it("a refused create toasts and leaves the list as it was", async () => {
    vi.mocked(createPlacement).mockRejectedValue(new HttpError(403, null, "You don't have permission to do this"));
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

  it("a batch that fails half-way keeps the rows that landed", async () => {
    // The first POST succeeded server-side; hiding that row would show a list
    // the gateway disagrees with until something remounts the editor.
    vi.mocked(createPlacement)
      .mockResolvedValueOnce(placement(11))
      .mockRejectedValue(new HttpError(403, null, "You don't have permission to do this"));
    const { result } = editor();

    let out: number | null = 7;
    await act(async () => {
      out = await result.current.s.create("tank", 3);
    });

    expect(out).toBeNull();
    expect(result.current.s.placements.map((p) => p.id)).toEqual([11]);
    expect(result.current.notices).toHaveLength(1);
    expect(onChanged).toHaveBeenCalledOnce();
    expect(result.current.s.placing).toBeNull();
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
