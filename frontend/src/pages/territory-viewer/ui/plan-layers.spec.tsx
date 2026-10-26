import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render as rtlRender, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Document } from "@/entities/document";
import { fakeLib, fakePdf, UNIT_RATIO, UTM_BBOX } from "@/features/zone-editor/model/plan-pdf.fixture";
import { loadPdfjs, openPdf, renderPage } from "@/entities/site-plan";
import { clearNotices } from "@/shared/lib/notify";
import type { PlanState } from "../model/use-plan-session";
import PlanLayers, { type PlanLayersProps } from "./plan-layers";

vi.mock("@/entities/site-plan", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadPdfjs: vi.fn(),
  openPdf: vi.fn(),
  renderPage: vi.fn(),
}));

const doc = (calibration: Document["calibration"] = null): Document => ({
  id: 4,
  territorySlug: "t",
  title: "plan.pdf",
  sourceBlobHash: "h4",
  createdAt: "t0",
  calibration,
});

const GROUND = { groundAt: () => 0.1, fallbackY: 0.5 };
const pip = {
  geo: { x: 0, y: 0, w: 600, h: 400 },
  dragging: false,
  startMove: vi.fn(),
  startResize: vi.fn(),
};

const props = (over: Partial<PlanLayersProps> = {}): PlanLayersProps => ({
  slug: "t",
  document: doc(),
  editing: true,
  bbox: UTM_BBOX,
  unitRatio: UNIT_RATIO,
  ground: GROUND,
  zones: [],
  pip,
  slot: null,
  acceptRef: { current: null },
  onPlan: vi.fn(),
  onChanged: vi.fn(),
  onZoneCreated: vi.fn(),
  onCalibrated: vi.fn(),
  onClose: vi.fn(),
  ...over,
});

// The zone form reads the model tags.
const render = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["model-tags"], [{ slug: "tanks", title: "Tanks" }]);
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
};

const lastPlan = (p: PlanLayersProps): PlanState | null => vi.mocked(p.onPlan).mock.calls.at(-1)?.[0] ?? null;

beforeEach(() => {
  clearNotices();
  // jsdom has no 2D context; the window only copies the picture onto its canvas.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
  vi.mocked(loadPdfjs).mockResolvedValue(fakeLib);
  vi.mocked(openPdf).mockResolvedValue(fakePdf());
  vi.mocked(renderPage).mockResolvedValue({ width: 4096, height: 2893, close: vi.fn() });
});

describe("PlanLayers, editing", () => {
  it("opens the plan window, and closes it from the title bar", async () => {
    const p = props();
    render(<PlanLayers {...p} />);
    expect(await screen.findByRole("dialog", { name: "Site plan" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close site plan" }));
    expect(p.onClose).toHaveBeenCalledOnce();
  });

  it("publishes the picture and the fit the automatic pairs give", async () => {
    const p = props();
    render(<PlanLayers {...p} />);
    await waitFor(() => expect(lastPlan(p)?.similarity).toBeTruthy());
    expect(lastPlan(p)?.image).toBeDefined();
    expect(lastPlan(p)?.awaitingScenePick).toBe(false);
  });

  it("publishes every rectangle as a ground outline once the plan is aligned, and none before", async () => {
    const unaligned = props({ bbox: null });
    render(<PlanLayers {...unaligned} />);
    await screen.findAllByRole("button", { name: /^Rectangle / });
    expect(lastPlan(unaligned)?.preview).toBeNull();

    const p = props();
    render(<PlanLayers {...p} />);
    const rects = await screen.findAllByRole("button", { name: /^Rectangle / });
    await waitFor(() => expect(lastPlan(p)?.preview?.outlines).toHaveLength(rects.length));
    for (const o of lastPlan(p)!.preview!.outlines) for (const c of o.corners) expect(c.y).toBeCloseTo(0.1, 12);
  });

  it("settles: the editor re-renders on its own, and the preview it publishes keeps its identity", async () => {
    const p = props();
    render(<PlanLayers {...p} />);
    await waitFor(() => expect(lastPlan(p)?.preview).toBeTruthy());
    const [first, calls] = [lastPlan(p)!.preview, vi.mocked(p.onPlan).mock.calls.length];
    await act(() => new Promise((done) => setTimeout(done, 60)));
    expect(vi.mocked(p.onPlan).mock.calls.length).toBe(calls);
    expect(lastPlan(p)!.preview).toBe(first);
  });

  it("picks the rectangle the canvas names, and says which in the preview and the zone form", async () => {
    const p = props();
    render(<PlanLayers {...p} />);
    await waitFor(() => expect(lastPlan(p)?.preview).toBeTruthy());
    const { outlines, onSelect } = lastPlan(p)!.preview!;
    act(() => onSelect(outlines[1].index));
    await waitFor(() => expect(lastPlan(p)?.preview?.selected).toBe(outlines[1].index));
    expect(lastPlan(p)?.preview?.label).toMatch(/^Rectangle /);
    act(() => lastPlan(p)!.preview!.onSelect(outlines[1].index));
    await waitFor(() => expect(lastPlan(p)?.preview?.selected).toBeNull());
  });

  it("leaves out the rectangle that is already a saved zone", async () => {
    const p = props();
    render(<PlanLayers {...p} />);
    await waitFor(() => expect(lastPlan(p)?.preview).toBeTruthy());
    const [first, ...rest] = lastPlan(p)!.preview!.outlines;
    const zone = {
      id: 1,
      title: "z",
      corners: first.corners,
      tags: [],
      drawingWidthM: null,
      drawingHeightM: null,
      createdAt: "",
      updatedAt: "",
    };
    const q = props({ zones: [zone] });
    render(<PlanLayers {...q} />);
    await waitFor(() => expect(lastPlan(q)?.preview?.outlines.map((o) => o.index)).not.toContain(first.index));
    expect(lastPlan(q)!.preview!.outlines.length).toBeLessThan(rest.length + 1);
  });

  it("puts the align panel and the zone form in the slot the Overlays panel offers", async () => {
    const slot = document.createElement("div");
    document.body.append(slot);
    render(<PlanLayers {...props({ slot })} />);
    expect(await screen.findByRole("region", { name: "Align plan" })).toBeInTheDocument();
    expect(slot).toContainElement(screen.getByRole("region", { name: "Align plan" }));
    expect(slot).toContainElement(screen.getByRole("form", { name: "New zone" }));
    slot.remove();
  });

  it("hands a scene click to the editor only while it waits for one", async () => {
    const p = props({ bbox: null });
    render(<PlanLayers {...p} />);
    const sheet = await screen.findByRole("group", { name: "Site plan sheet" });
    expect(p.acceptRef.current).toBeNull();

    await userEvent.pointer([{ keys: "[MouseLeft>]", target: sheet }, { keys: "[/MouseLeft]" }]);
    await waitFor(() => expect(p.acceptRef.current).toBeTypeOf("function"));
    expect(lastPlan(p)?.awaitingScenePick).toBe(true);

    act(() => p.acceptRef.current?.({ x: 1, y: 0, z: 2 }));
    await waitFor(() => expect(p.acceptRef.current).toBeNull());
  });

  it("takes the rectangles out of the way while pairs are being placed", async () => {
    const p = props({ bbox: null });
    render(<PlanLayers {...p} />);
    const rect = (await screen.findAllByRole("button", { name: /^Rectangle / }))[0];
    expect(rect).toHaveStyle({ pointerEvents: "none" });
  });

  // The real MR1 sheet has a rectangle around the whole site: while a pair is
  // being placed it must not swallow the click that picks the point.
  it("lets a click through every rectangle of the real plan, the site frame included, while pairs are placed", async () => {
    render(<PlanLayers {...props({ bbox: null })} />);
    const rects = await screen.findAllByRole("button", { name: /^Rectangle / });
    expect(rects.length).toBeGreaterThan(1);
    for (const rect of rects) expect(rect).toHaveStyle({ pointerEvents: "none" });
  });

  it("makes the rectangles pickable again once the plan is aligned", async () => {
    render(<PlanLayers {...props()} />);
    const rects = await screen.findAllByRole("button", { name: /^Rectangle / });
    for (const rect of rects) expect(rect).not.toHaveStyle({ pointerEvents: "none" });
  });

  it("unpublishes the plan when it goes", async () => {
    const p = props();
    const { unmount } = render(<PlanLayers {...p} />);
    await waitFor(() => expect(lastPlan(p)).not.toBeNull());
    unmount();
    expect(lastPlan(p)).toBeNull();
    expect(p.acceptRef.current).toBeNull();
  });

  it("waits for the ground before it opens the editor", () => {
    render(<PlanLayers {...props({ ground: null })} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("PlanLayers, drawing a saved plan", () => {
  const saved = doc({
    page: 1,
    points: [
      { pdf: { x: 0, y: 0 }, scene: { x: 0, y: 0, z: 0 }, utm: null },
      { pdf: { x: 100, y: 0 }, scene: { x: 1, y: 0, z: 0 }, utm: null },
    ],
  });

  it("publishes the aligned picture and the fit of the saved pairs, and shows no window", async () => {
    const p = props({ document: saved, editing: false });
    render(<PlanLayers {...p} />);
    await waitFor(() => expect(lastPlan(p)?.similarity).toBeTruthy());
    expect(lastPlan(p)?.similarity?.scale).toBeCloseTo(0.01, 10);
    expect(lastPlan(p)?.awaitingScenePick).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("publishes no fit for pairs that do not give one", async () => {
    const p = props({ document: doc({ page: 1, points: [] }), editing: false });
    render(<PlanLayers {...p} />);
    await waitFor(() => expect(lastPlan(p)).not.toBeNull());
    expect(lastPlan(p)?.similarity).toBeNull();
  });
});
