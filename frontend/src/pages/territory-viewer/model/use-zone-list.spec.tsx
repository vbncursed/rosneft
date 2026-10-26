import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteZone, type Zone } from "@/entities/zone";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useZoneList } from "./use-zone-list";

vi.mock("@/entities/zone", async (importOriginal) => ({ ...(await importOriginal<object>()), deleteZone: vi.fn() }));

const zone = (id: number): Zone => ({
  id,
  title: `Zone ${id}`,
  corners: [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 1, y: 0, z: 1 },
    { x: 0, y: 0, z: 1 },
  ],
  tags: [],
  drawingWidthM: null,
  drawingHeightM: null,
  createdAt: "",
  updatedAt: "",
});

let onChanged: ReturnType<typeof vi.fn<() => void>>;
const list = (initial = [zone(1), zone(2)]) =>
  renderHook(() => ({ s: useZoneList({ slug: "t", initial, onChanged }), notices: useNotices() }));

beforeEach(() => {
  localStorage.clear();
  onChanged = vi.fn();
  vi.mocked(deleteZone).mockReset();
  clearNotices();
});

describe("useZoneList", () => {
  it("seeds from the bundle and selects nothing", () => {
    const { result } = list();
    expect(result.current.s.zones.map((z) => z.id)).toEqual([1, 2]);
    expect(result.current.s.selected).toBeNull();
  });

  it("selects a zone, and a second pick on it lets go", () => {
    const { result } = list();
    act(() => result.current.s.select(2));
    expect(result.current.s.selected?.id).toBe(2);
    act(() => result.current.s.select(2));
    expect(result.current.s.selected).toBeNull();
    act(() => result.current.s.select(1));
    act(() => result.current.s.select(null));
    expect(result.current.s.selected).toBeNull();
  });

  it("takes in a created zone, and a rewritten one in place", () => {
    const { result } = list();
    act(() => result.current.s.add(zone(3)));
    expect(result.current.s.zones.map((z) => z.id)).toEqual([1, 2, 3]);
    act(() => result.current.s.add({ ...zone(3), title: "Renamed" }));
    expect(result.current.s.zones.map((z) => z.title)).toEqual(["Zone 1", "Zone 2", "Renamed"]);
  });

  it("deletes a zone, lets go of it if selected, and marks the bundle stale", async () => {
    vi.mocked(deleteZone).mockResolvedValue(undefined);
    const { result } = list();
    act(() => result.current.s.select(1));
    await act(() => result.current.s.remove(1));
    expect(deleteZone).toHaveBeenCalledWith("t", 1);
    expect(result.current.s.zones.map((z) => z.id)).toEqual([2]);
    expect(result.current.s.selected).toBeNull();
    expect(result.current.notices[0]?.message).toBe("Zone deleted");
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("keeps a zone the gateway refused to delete, and says why", async () => {
    vi.mocked(deleteZone).mockRejectedValue(new HttpError(403, null, "You don't have permission to do this"));
    const { result } = list();
    await act(() => result.current.s.remove(1));
    expect(result.current.s.zones.map((z) => z.id)).toEqual([1, 2]);
    expect(result.current.notices[0]?.message).toBe("You don't have permission to do this");
    // A refused delete may mean the row is gone for another reason: the bundle is stale either way.
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("shows zones until the reader switches them off, and remembers it", () => {
    const first = list();
    expect(first.result.current.s.show).toBe(true);
    act(() => first.result.current.s.toggleShow());
    expect(first.result.current.s.show).toBe(false);
    expect(localStorage.getItem("andrey.zones")).toBe("hidden");
    first.unmount();
    expect(list().result.current.s.show).toBe(false);
  });
});
