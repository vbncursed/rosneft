import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deletePanorama, updatePanorama, type Panorama } from "@/entities/panorama";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { usePanoramaList } from "./use-panorama-list";

vi.mock("@/entities/panorama", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updatePanorama: vi.fn(),
  deletePanorama: vi.fn(),
}));

const panorama = (id: number, over: Partial<Panorama> = {}): Panorama => ({
  id,
  territorySlug: "t",
  slug: `p${id}`,
  title: `Point ${id}`,
  sourceBlobHash: `h${id}`,
  position: { x: 1, y: 2, z: 3 },
  yawOffset: 0,
  defaultYaw: 0.5,
  updatedAt: "t0",
  ...over,
});

let onChanged: ReturnType<typeof vi.fn<() => void>>;

const list = (initial: Panorama[]) =>
  renderHook(() => ({
    s: usePanoramaList({ slug: "t", initial, onChanged }),
    notices: useNotices(),
  }));

beforeEach(() => {
  vi.mocked(updatePanorama).mockReset();
  vi.mocked(deletePanorama).mockReset();
  onChanged = vi.fn();
  clearNotices();
});

describe("usePanoramaList", () => {
  it("sends the whole row for a one-field patch and swaps in the server's answer", async () => {
    const saved = panorama(1, { yawOffset: 1, updatedAt: "t1" });
    vi.mocked(updatePanorama).mockResolvedValue(saved);
    const { result } = list([panorama(1), panorama(2)]);

    await act(async () => {
      await result.current.s.update(1, { yawOffset: 1 });
    });

    // The PUT replaces the row, so the fields the caller did not touch travel
    // back unchanged or the gateway would blank them.
    expect(updatePanorama).toHaveBeenCalledWith("t", 1, {
      title: "Point 1",
      position: { x: 1, y: 2, z: 3 },
      yawOffset: 1,
      defaultYaw: 0.5,
    });
    expect(result.current.s.panoramas[0]).toEqual(saved);
    expect(result.current.s.panoramas[1].id).toBe(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("rolls the row back and says why when the update is refused", async () => {
    vi.mocked(updatePanorama).mockRejectedValue(new HttpError(422, null, "Yaw out of range."));
    const { result } = list([panorama(1)]);

    await act(async () => {
      await result.current.s.update(1, { yawOffset: 9 });
    });

    expect(result.current.s.panoramas[0].yawOffset).toBe(0);
    expect(result.current.notices[0]).toMatchObject({
      tone: "error",
      message: "Failed to update panorama: Yaw out of range.",
    });
  });

  it("ignores a patch for a row it does not hold", async () => {
    const { result } = list([panorama(1)]);
    await act(async () => {
      await result.current.s.update(99, { yawOffset: 1 });
    });
    expect(updatePanorama).not.toHaveBeenCalled();
  });

  it("drops the row before the DELETE lands, then confirms it", async () => {
    let resolveDelete!: () => void;
    vi.mocked(deletePanorama).mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
    );
    const { result } = list([panorama(1), panorama(2)]);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.s.remove(1);
    });
    // The capture is gone from the picker immediately — the round trip only
    // confirms it.
    expect(result.current.s.panoramas.map((p) => p.id)).toEqual([2]);
    expect(result.current.s.pendingId).toBe(1);

    await act(async () => {
      resolveDelete();
      await pending;
    });
    expect(result.current.notices[0]).toMatchObject({ tone: "success", message: "Panorama deleted" });
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(result.current.s.pendingId).toBeNull();
  });

  it("puts the row back when the delete is refused", async () => {
    vi.mocked(deletePanorama).mockRejectedValue(new HttpError(409, null, "Still referenced."));
    const { result } = list([panorama(1), panorama(2)]);

    await act(async () => {
      await result.current.s.remove(1);
    });

    expect(result.current.s.panoramas.map((p) => p.id)).toEqual([1, 2]);
    expect(result.current.notices[0]).toMatchObject({
      tone: "error",
      message: "Failed to delete panorama: Still referenced.",
    });
  });

  it("appends what the upload created, and marks nothing pending in between", async () => {
    const { result } = list([panorama(1)]);
    expect(result.current.s.pendingId).toBeNull();

    act(() => result.current.s.add(panorama(2)));
    expect(result.current.s.panoramas.map((p) => p.id)).toEqual([1, 2]);
    expect(result.current.s.pendingId).toBeNull();
  });

  it("names the row whose PUT is in flight", async () => {
    let resolveUpdate!: (p: Panorama) => void;
    vi.mocked(updatePanorama).mockReturnValue(
      new Promise<Panorama>((resolve) => {
        resolveUpdate = resolve;
      }),
    );
    const { result } = list([panorama(1)]);

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.s.update(1, { title: "Renamed" });
    });
    await waitFor(() => expect(result.current.s.pendingId).toBe(1));

    await act(async () => {
      resolveUpdate(panorama(1, { title: "Renamed" }));
      await pending;
    });
    expect(result.current.s.pendingId).toBeNull();
  });
});
