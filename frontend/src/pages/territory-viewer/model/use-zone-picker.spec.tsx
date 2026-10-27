import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Zone } from "@/entities/zone";
import { useZonePicker } from "./use-zone-picker";

const zone = (id: number): Zone => ({
  id,
  title: `Zone ${id}`,
  corners: [0, 1, 2, 3].map((x) => ({ x, y: 0, z: 0 })) as Zone["corners"],
  tags: [],
  drawingWidthM: null,
  drawingHeightM: null,
  createdAt: "",
  updatedAt: "",
});
const ZONES = [zone(1), zone(2)];

// The list's own selection, as `useZoneList` keeps it: selecting the selected zone toggles it off.
const picker = (canPlace = true, place = vi.fn().mockResolvedValue(3)) =>
  renderHook(() => {
    const [id, setId] = useState<number | null>(null);
    const select = (next: number | null) => setId((now) => (now === next ? null : next));
    const selected = ZONES.find((z) => z.id === id) ?? null;
    return { selected, select, p: useZonePicker({ selected, select, canPlace, place }) };
  });

describe("useZonePicker", () => {
  it("selects the clicked zone and opens the picker on it", () => {
    const { result } = picker();
    act(() => result.current.p.clicked(2));
    expect(result.current.selected?.id).toBe(2);
    expect(result.current.p.pick?.zone.id).toBe(2);
  });

  it("selects and opens nothing more for a reader who cannot place", () => {
    const { result } = picker(false);
    act(() => result.current.p.clicked(2));
    expect(result.current.selected?.id).toBe(2);
    expect(result.current.p.pick).toBeNull();
    expect(result.current.p.onAddObjects).toBeUndefined();
  });

  it("keeps the zone selected when it is clicked again after the picker closed", () => {
    const { result } = picker();
    act(() => result.current.p.clicked(1));
    act(() => result.current.p.pick?.onClose());
    act(() => result.current.p.clicked(1));
    expect(result.current.selected?.id).toBe(1);
    expect(result.current.p.pick?.zone.id).toBe(1);
  });

  it("follows a click on another zone", () => {
    const { result } = picker();
    act(() => result.current.p.clicked(1));
    act(() => result.current.p.clicked(2));
    expect(result.current.p.pick?.zone.id).toBe(2);
  });

  it("closes with the zone and does not reopen when the panel selects it again", () => {
    const { result } = picker();
    act(() => result.current.p.clicked(1));
    act(() => result.current.select(null));
    expect(result.current.p.pick).toBeNull();
    act(() => result.current.select(1));
    expect(result.current.p.pick).toBeNull();
  });

  it("reopens from Add objects", () => {
    const { result } = picker();
    act(() => result.current.p.clicked(1));
    act(() => result.current.p.pick?.onClose());
    act(() => result.current.p.onAddObjects?.());
    expect(result.current.p.pick?.zone.id).toBe(1);
  });

  it("closes after a placing that landed, and stays open after a refused one", async () => {
    const landed = picker(true, vi.fn().mockResolvedValue(3));
    act(() => landed.result.current.p.clicked(1));
    await act(async () => landed.result.current.p.pick?.onPlace("tank", 2));
    expect(landed.result.current.p.pick).toBeNull();

    const place = vi.fn().mockResolvedValue(null);
    const refused = picker(true, place);
    act(() => refused.result.current.p.clicked(1));
    await act(async () => refused.result.current.p.pick?.onPlace("tank", 2));
    expect(place).toHaveBeenCalledWith("tank", 2);
    expect(refused.result.current.p.pick?.zone.id).toBe(1);
  });
});
