import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Calibration, Document } from "@/entities/document";
import type { Zone } from "@/entities/zone";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useViewerZones, type ViewerZonesParams } from "./use-viewer-zones";

const CAL: Calibration = { page: 1, points: [] };
const doc = (id: number, calibration: Calibration | null = null): Document => ({
  id,
  territorySlug: "t",
  title: `plan-${id}.pdf`,
  sourceBlobHash: `h${id}`,
  createdAt: "",
  calibration,
});
// 0.2 × 0.1 scene units: 10 × 5 m at 50 m per unit, the drawing's own size.
const ZONE: Zone = {
  id: 7,
  title: "Tank row",
  corners: [
    { x: 0, y: 0, z: 0 },
    { x: 0.2, y: 0, z: 0 },
    { x: 0.2, y: 0, z: 0.1 },
    { x: 0, y: 0, z: 0.1 },
  ],
  tags: [{ slug: "tanks", title: "Tanks" }],
  drawingWidthM: 10,
  drawingHeightM: 5,
  createdAt: "",
  updatedAt: "",
};
const pip = { geo: { x: 0, y: 0, w: 1, h: 1 }, dragging: false, startMove: vi.fn(), startResize: vi.fn() };

const base = (): ViewerZonesParams => ({
  slug: "t",
  initialZones: [ZONE],
  bbox: null,
  unitRatio: 50,
  documents: { list: [doc(1), doc(2, CAL)], pip, onExit: vi.fn(), setCalibration: vi.fn() },
  placements: [],
  create: vi.fn().mockResolvedValue(1),
  canWrite: true,
  onChanged: vi.fn(),
  expandPanel: vi.fn(),
});

const zones = (over: Partial<ViewerZonesParams> = {}) => {
  const first = { ...base(), ...over };
  return renderHook((p: ViewerZonesParams) => ({ z: useViewerZones(p), notices: useNotices() }), {
    initialProps: first,
  });
};

beforeEach(() => {
  localStorage.clear();
  clearNotices();
});

describe("useViewerZones", () => {
  it("offers Align plan on a row only with zone:write", () => {
    expect(zones().result.current.z.onAlign).toBeTypeOf("function");
    expect(zones({ canWrite: false }).result.current.z.onAlign).toBeUndefined();
  });

  it("opens the editor on the row: the PDF window goes, the Overlays panel opens, the layer is the editor's", () => {
    const params = base();
    const { result } = zones(params);
    act(() => result.current.z.onAlign?.(1));
    expect(params.documents.onExit).toHaveBeenCalledOnce();
    expect(params.expandPanel).toHaveBeenCalledOnce();
    expect(result.current.z.editing?.id).toBe(1);
    expect(result.current.z.layer).toMatchObject({ document: { id: 1 }, slug: "t" });
  });

  it("mounts no plan layer until the editor is opened, even when a document is aligned", () => {
    const { result } = zones();
    expect(result.current.z.layer).toBeNull();
    expect(result.current.z.site.zones).toBeDefined();
  });

  it("keeps the document list's copy in step with the calibration the editor saves", () => {
    const params = base();
    const { result } = zones(params);
    act(() => result.current.z.onAlign?.(1));
    act(() => result.current.z.layer?.onCalibrated(CAL));
    expect(params.documents.setCalibration).toHaveBeenCalledWith(1, CAL);
  });

  it("takes a created zone into the list", () => {
    const { result } = zones();
    act(() => result.current.z.onAlign?.(1));
    act(() => result.current.z.layer?.onZoneCreated({ ...ZONE, id: 8, title: "Crane" }));
    expect(result.current.z.list.map((z) => z.id)).toEqual([7, 8]);
    expect(result.current.z.site.zones).toBe(result.current.z.list);
  });

  it("measures the selected zone in metres per scene unit, not the reverse", () => {
    const { result } = zones();
    act(() => result.current.z.onSelect(7));
    expect(result.current.z.selected?.id).toBe(7);
    expect(result.current.z.equipment.sizeLine?.text).toBe("Drawing 10.0 × 5.0 m · Model 10.0 × 5.0 m (0 %)");
    expect(result.current.z.equipment.sizeLine?.warn).toBe(false);
  });

  it("places from the selected zone", () => {
    const params = base();
    const { result } = zones(params);
    act(() => result.current.z.onSelect(7));
    act(() => result.current.z.equipment.onPlace("tank-500", 2));
    expect(params.create).toHaveBeenCalledWith("tank-500", 2, null, {
      position: { x: expect.closeTo(0.1, 10), y: 0, z: expect.closeTo(0.05, 10) },
      yaw: expect.closeTo(0, 10),
    });
  });

  it("hands the canvas one site object that survives unrelated renders", () => {
    const { result, rerender } = zones();
    const site = result.current.z.site;
    // A fold re-renders the page with fresh parts around the same state.
    rerender({ ...base(), initialZones: [], documents: { ...base().documents, list: [doc(1), doc(2, CAL)] } });
    expect(result.current.z.site).toBe(site);
    expect(result.current.z.site.onSelectZone).toBe(site.onSelectZone);
  });

  it("asks the canvas to take the next model click as a point only while the editor waits", () => {
    const { result } = zones();
    expect(result.current.z.pickScene).toBe(false);
    act(() => result.current.z.onAlign?.(1));
    act(() => result.current.z.layer?.onPlan({ image: {} as ImageBitmap, awaitingScenePick: true, preview: null }));
    expect(result.current.z.pickScene).toBe(true);
  });

  it("closes the editor and unmounts the overlay when the plan it stands on is removed (Review Focus 4)", () => {
    const params = base();
    const { result, rerender } = zones(params);
    act(() => result.current.z.onAlign?.(2));
    act(() => result.current.z.layer?.onPlan({ image: {} as ImageBitmap, awaitingScenePick: false, preview: null }));
    expect(result.current.z.editorReady).toBe(true);

    rerender({ ...params, documents: { ...params.documents, list: [doc(1)] } });
    expect(result.current.z.editing).toBeNull();
    expect(result.current.z.layer).toBeNull();
    expect(result.current.z.editorReady).toBe(false);
    expect(result.current.z.pickScene).toBe(false);
    expect(result.current.notices.map((n) => [n.tone, n.message])).toEqual([["info", "The plan was removed."]]);
  });
});
