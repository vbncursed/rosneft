import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Document } from "@/entities/document";
import { loadPdfjs, openPdf, renderPage } from "@/entities/site-plan";
import { createZone, type Zone } from "@/entities/zone";
import { clearNotices } from "@/shared/lib/notify";
import { fakeLib, fakePdf, UNIT_RATIO, UTM_BBOX } from "./plan-pdf.fixture";
import { useZoneEditor } from "./use-zone-editor";

vi.mock("@/entities/site-plan", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadPdfjs: vi.fn(),
  openPdf: vi.fn(),
  renderPage: vi.fn(),
}));
vi.mock("@/entities/zone", async (importOriginal) => ({ ...(await importOriginal<object>()), createZone: vi.fn() }));

const document: Document = {
  id: 4,
  territorySlug: "t",
  title: "plan.pdf",
  sourceBlobHash: "h4",
  createdAt: "t0",
  calibration: null,
};

let onChanged: ReturnType<typeof vi.fn<() => void>>;
const editor = async (zones: Zone[] = [], pages = 1) => {
  vi.mocked(openPdf).mockResolvedValue(fakePdf(pages));
  const hook = renderHook(() =>
    useZoneEditor({
      slug: "t",
      document,
      bbox: UTM_BBOX,
      unitRatio: UNIT_RATIO,
      groundAt: () => 0.1,
      fallbackY: 0.5,
      zones,
      onChanged,
    }),
  );
  await waitFor(() => expect(hook.result.current.image).not.toBeNull());
  return hook;
};

beforeEach(() => {
  onChanged = vi.fn();
  clearNotices();
  vi.mocked(loadPdfjs).mockResolvedValue(fakeLib);
  vi.mocked(renderPage).mockResolvedValue({ width: 10, height: 10, close: vi.fn() });
  vi.mocked(createZone).mockReset();
});

describe("useZoneEditor", () => {
  it("offers the page, its rectangles, and the automatic alignment", async () => {
    const { result } = await editor();
    expect(result.current.rects.length).toBeGreaterThan(0);
    expect(result.current.pairs.length).toBeGreaterThanOrEqual(2);
    expect(result.current.fit?.ok).toBe(true);
    expect(result.current.page).toBe(1);
  });

  it("adds a pair from a plan click and a scene point handed to the editor", async () => {
    const { result } = await editor();
    const before = result.current.pairs.length;
    act(() => result.current.alignment.addPlanPoint({ x: 3, y: 4 }));
    act(() => result.current.acceptScenePoint({ x: 0, y: 0, z: 0 }));
    expect(result.current.pairs).toHaveLength(before + 1);
  });

  it("selects a rectangle, and a second press on it lets go", async () => {
    const { result } = await editor();
    act(() => result.current.selectRect(1));
    expect(result.current.selected).toBe(1);
    act(() => result.current.selectRect(1));
    expect(result.current.selected).toBeNull();
  });

  it("forgets the selection when the page changes", async () => {
    const { result } = await editor([], 2);
    act(() => result.current.selectRect(0));
    act(() => result.current.setPage(2));
    expect(result.current.selected).toBeNull();
    await waitFor(() => expect(result.current.image).not.toBeNull());
  });

  it("creates a zone from the selected rectangle through the fit", async () => {
    vi.mocked(createZone).mockResolvedValue({} as Zone);
    const { result } = await editor();
    act(() => result.current.selectRect(0));
    await act(() => result.current.createZone({ title: "Tank row", tagSlugs: ["tanks"] }));
    const [slug, body] = vi.mocked(createZone).mock.calls[0];
    expect(slug).toBe("t");
    expect(body).toMatchObject({ title: "Tank row", tagSlugs: ["tanks"] });
    expect(body.corners).toHaveLength(4);
    expect(body.corners.every((c) => [c.x, c.y, c.z].every(Number.isFinite))).toBe(true);
    expect(body.corners[0].y).toBe(0.1);
    expect(onChanged).toHaveBeenCalledOnce();
    expect(result.current.selected).toBeNull();
  });

  it("creates nothing without a rectangle", async () => {
    const { result } = await editor();
    await act(() => result.current.createZone({ title: "Tank row", tagSlugs: ["tanks"] }));
    expect(createZone).not.toHaveBeenCalled();
  });

  it("lets a failed create reach the form", async () => {
    vi.mocked(createZone).mockRejectedValue(new Error("clash"));
    const { result } = await editor();
    act(() => result.current.selectRect(0));
    await expect(result.current.createZone({ title: "x", tagSlugs: ["tanks"] })).rejects.toThrow("clash");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("draws the saved zones back on the page through the fit", async () => {
    const corner = (x: number, z: number) => ({ x, y: 0, z });
    const zone = {
      id: 9,
      title: "Crane",
      corners: [corner(0, 0), corner(0.1, 0), corner(0.1, 0.1), corner(0, 0.1)],
    } as Zone;
    const { result } = await editor([zone]);
    expect(result.current.planZones).toHaveLength(1);
    expect(result.current.planZones[0].title).toBe("Crane");
  });
});
