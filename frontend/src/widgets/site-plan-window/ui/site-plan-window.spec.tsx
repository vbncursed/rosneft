import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlanRect } from "@/entities/site-plan";
import { SitePlanWindow, type SitePlanWindowProps } from "./site-plan-window";

const rect = (x: number, y: number, w: number, h: number): PlanRect => ({
  corners: [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ],
  widthPt: w,
  heightPt: h,
  angle: 0,
});
const MPP = 1 / 6.6;

const props = (over: Partial<SitePlanWindowProps> = {}): SitePlanWindowProps => ({
  image: null,
  pageSize: { width: 400, height: 300 },
  rects: [rect(50, 50, 49.5, 85.8), rect(200, 50, 40, 40)],
  zones: [],
  pairs: [],
  selected: null,
  metresPerPt: MPP,
  onSelectRect: vi.fn(),
  onDragPair: vi.fn(),
  onPlanClick: vi.fn(),
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe("SitePlanWindow rectangles", () => {
  it("offers each rectangle as a button named by its size in metres", () => {
    render(<SitePlanWindow {...props()} />);
    expect(screen.getByRole("button", { name: "Rectangle 7.5 × 13.0 m" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rectangle 6.1 × 6.1 m" })).toBeInTheDocument();
  });

  it("names them in points when the plan has no scale", () => {
    render(<SitePlanWindow {...props({ metresPerPt: null })} />);
    expect(screen.getByRole("button", { name: "Rectangle 50 × 86 pt" })).toBeInTheDocument();
  });

  it("tells twins apart", () => {
    render(<SitePlanWindow {...props({ rects: [rect(0, 0, 40, 40), rect(100, 0, 40, 40)] })} />);
    expect(screen.getByRole("button", { name: "Rectangle 6.1 × 6.1 m, 1 of 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rectangle 6.1 × 6.1 m, 2 of 2" })).toBeInTheDocument();
  });

  it("says which one is selected by aria-pressed", () => {
    render(<SitePlanWindow {...props({ selected: 1 })} />);
    expect(screen.getByRole("button", { name: /^Rectangle 7\.5/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /^Rectangle 6\.1/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("selects with a click and with the keyboard", async () => {
    const onSelectRect = vi.fn();
    render(<SitePlanWindow {...props({ onSelectRect })} />);
    await userEvent.click(screen.getByRole("button", { name: /^Rectangle 7\.5/ }));
    expect(onSelectRect).toHaveBeenLastCalledWith(0);
    await userEvent.tab();
    expect(screen.getByRole("button", { name: /^Rectangle 6\.1/ })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onSelectRect).toHaveBeenLastCalledWith(1);
    await userEvent.keyboard(" ");
    expect(onSelectRect).toHaveBeenCalledTimes(3);
  });

  it("does not read a rectangle click as a click on the sheet", async () => {
    const onPlanClick = vi.fn();
    render(<SitePlanWindow {...props({ onPlanClick })} />);
    await userEvent.click(screen.getByRole("button", { name: /^Rectangle 7\.5/ }));
    expect(onPlanClick).not.toHaveBeenCalled();
  });
});

describe("SitePlanWindow zones", () => {
  it("draws each saved zone with its title", () => {
    const corners = [
      { x: 10, y: 10 },
      { x: 60, y: 10 },
      { x: 60, y: 40 },
      { x: 10, y: 40 },
    ];
    render(<SitePlanWindow {...props({ zones: [{ id: 3, title: "Crane pad", corners }] })} />);
    expect(screen.getAllByText("Crane pad")).toHaveLength(2);
  });

  it("lists the saved zones for a screen reader, since the drawing is hidden from one", () => {
    const corners = [
      { x: 10, y: 10 },
      { x: 60, y: 10 },
      { x: 60, y: 40 },
      { x: 10, y: 40 },
    ];
    const zones = [
      { id: 3, title: "Crane pad", corners },
      { id: 4, title: "Tank row", corners },
    ];
    render(<SitePlanWindow {...props({ zones })} />);
    const list = screen.getByRole("list", { name: "Saved zones" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Crane pad", "Tank row"]);
  });

  it("lists nothing when there are no zones", () => {
    render(<SitePlanWindow {...props()} />);
    expect(screen.queryByRole("list", { name: "Saved zones" })).not.toBeInTheDocument();
  });
});

describe("SitePlanWindow sheet", () => {
  const sheet = () => screen.getByRole("group", { name: "Site plan sheet" });

  it("reports a bare click in page points", () => {
    const onPlanClick = vi.fn();
    render(<SitePlanWindow {...props({ onPlanClick })} />);
    fireEvent.pointerDown(sheet(), { clientX: 120, clientY: 80 });
    fireEvent.pointerUp(sheet(), { clientX: 120, clientY: 80 });
    expect(onPlanClick).toHaveBeenCalledWith({ x: 120, y: 80 });
  });

  it("treats a drag as a pan, not a click", () => {
    const onPlanClick = vi.fn();
    render(<SitePlanWindow {...props({ onPlanClick })} />);
    fireEvent.pointerDown(sheet(), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(sheet(), { clientX: 140, clientY: 100, buttons: 1 });
    fireEvent.pointerUp(sheet(), { clientX: 140, clientY: 100 });
    expect(onPlanClick).not.toHaveBeenCalled();
  });

  const clickAt = (x: number, y: number) => {
    fireEvent.pointerDown(sheet(), { clientX: x, clientY: y });
    fireEvent.pointerUp(sheet(), { clientX: x, clientY: y });
  };

  it("pans by the drag distance, and the next click lands on the moved sheet", () => {
    const onPlanClick = vi.fn();
    render(<SitePlanWindow {...props({ onPlanClick })} />);
    fireEvent.pointerDown(sheet(), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(sheet(), { clientX: 140, clientY: 120, buttons: 1 });
    fireEvent.pointerUp(sheet(), { clientX: 140, clientY: 120 });
    clickAt(140, 120);
    expect(onPlanClick).toHaveBeenLastCalledWith({ x: 100, y: 100 });
  });

  it("ends a pan whose button was let go out of sight, instead of panning on hover", () => {
    const onPlanClick = vi.fn();
    render(<SitePlanWindow {...props({ onPlanClick })} />);
    fireEvent.pointerDown(sheet(), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(sheet(), { clientX: 140, clientY: 100, buttons: 1 });
    fireEvent.pointerMove(sheet(), { clientX: 200, clientY: 100, buttons: 0 });
    fireEvent.pointerMove(sheet(), { clientX: 300, clientY: 100, buttons: 0 });
    clickAt(40, 0);
    // Panned by the first 40 only.
    expect(onPlanClick).toHaveBeenLastCalledWith({ x: 0, y: 0 });
  });

  it("ends the press on a cancelled or lost pointer", () => {
    const onPlanClick = vi.fn();
    render(<SitePlanWindow {...props({ onPlanClick })} />);
    for (const end of [fireEvent.pointerCancel, fireEvent.lostPointerCapture]) {
      fireEvent.pointerDown(sheet(), { clientX: 10, clientY: 10 });
      end(sheet());
      fireEvent.pointerUp(sheet(), { clientX: 10, clientY: 10 });
    }
    expect(onPlanClick).not.toHaveBeenCalled();
  });

  it("captures the pointer so a release outside the sheet still arrives", () => {
    render(<SitePlanWindow {...props()} />);
    const capture = vi.fn();
    sheet().setPointerCapture = capture;
    fireEvent.pointerDown(sheet(), { pointerId: 7, clientX: 10, clientY: 10 });
    expect(capture).toHaveBeenCalledWith(7);
  });

  it("lets a click through the rectangles while a pair is being placed", async () => {
    const [onPlanClick, onSelectRect] = [vi.fn(), vi.fn()];
    render(<SitePlanWindow {...props({ onPlanClick, onSelectRect, placing: true })} />);
    const frame = screen.getByRole("button", { name: /^Rectangle 7\.5/ });
    expect(frame).toHaveStyle({ pointerEvents: "none" });
    await expect(userEvent.click(frame)).rejects.toThrow(/pointer-events/);
    clickAt(70, 70);
    expect(onPlanClick).toHaveBeenCalledWith({ x: 70, y: 70 });
    expect(onSelectRect).not.toHaveBeenCalled();
  });

  it("keeps the rectangles pressable otherwise", () => {
    render(<SitePlanWindow {...props()} />);
    expect(screen.getByRole("button", { name: /^Rectangle 7\.5/ })).not.toHaveStyle({ pointerEvents: "none" });
  });

  it("refits a page of another size even after a pan", () => {
    const onPlanClick = vi.fn();
    const { rerender } = render(<SitePlanWindow {...props({ onPlanClick })} />);
    fireEvent.pointerDown(sheet(), { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(sheet(), { clientX: 160, clientY: 100, buttons: 1 });
    fireEvent.pointerUp(sheet(), { clientX: 160, clientY: 100 });
    rerender(<SitePlanWindow {...props({ onPlanClick, pageSize: { width: 800, height: 500 } })} />);
    clickAt(20, 30);
    expect(onPlanClick).toHaveBeenLastCalledWith({ x: 20, y: 30 });
  });

  it("zooms about the centre with the buttons, and fits again", async () => {
    const onPlanClick = vi.fn();
    render(<SitePlanWindow {...props({ onPlanClick })} />);
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    clickAt(125, 125);
    expect(onPlanClick.mock.calls[0][0].x).toBeCloseTo(100, 9);
    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    clickAt(125, 125);
    expect(onPlanClick.mock.calls[1][0].x).toBeCloseTo(125, 9);
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    await userEvent.click(screen.getByRole("button", { name: "Fit the page" }));
    clickAt(20, 30);
    expect(onPlanClick).toHaveBeenLastCalledWith({ x: 20, y: 30 });
  });

  it("zooms the wheel by its delta, about the cursor", () => {
    const onPlanClick = vi.fn();
    render(<SitePlanWindow {...props({ onPlanClick })} />);
    fireEvent.wheel(sheet(), { deltaY: -100, clientX: 100, clientY: 100 });
    clickAt(200, 200);
    // k = e^0.15; the point under the cursor stays at page (100, 100).
    expect(onPlanClick.mock.calls[0][0].x).toBeCloseTo(100 + 100 / Math.exp(0.15), 9);
  });

  it("zooms a small trackpad delta gently, and a huge one only by the cap", () => {
    const onPlanClick = vi.fn();
    render(<SitePlanWindow {...props({ onPlanClick })} />);
    fireEvent.wheel(sheet(), { deltaY: -2, clientX: 0, clientY: 0 });
    clickAt(100, 0);
    expect(onPlanClick.mock.calls[0][0].x).toBeCloseTo(100 / Math.exp(0.003), 9);
    fireEvent.wheel(sheet(), { deltaY: -100000, clientX: 0, clientY: 0 });
    clickAt(100, 0);
    expect(onPlanClick.mock.calls[1][0].x).toBeCloseTo(100 / (Math.exp(0.003) * 2), 9);
  });

  it("draws the page picture when it has one", () => {
    const draw = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: draw,
    } as unknown as CanvasRenderingContext2D);
    const image = { width: 800, height: 600 } as ImageBitmap;
    render(<SitePlanWindow {...props({ image })} />);
    expect(draw).toHaveBeenCalledWith(image, 0, 0);
  });
});

describe("SitePlanWindow pairs", () => {
  it("shows a marker per pair, nudged with the arrow keys", async () => {
    const onDragPair = vi.fn();
    render(
      <SitePlanWindow {...props({ pairs: [{ pdf: { x: 10, y: 10 } }, { pdf: { x: 90, y: 20 } }], onDragPair })} />,
    );
    screen.getByRole("button", { name: "Move plan point 2" }).focus();
    await userEvent.keyboard("{ArrowRight}{ArrowUp}");
    expect(onDragPair).toHaveBeenNthCalledWith(1, 1, { x: 91, y: 20 });
    expect(onDragPair).toHaveBeenNthCalledWith(2, 1, { x: 90, y: 19 });
  });

  it("drags a marker to where the pointer goes", () => {
    const onDragPair = vi.fn();
    render(<SitePlanWindow {...props({ pairs: [{ pdf: { x: 10, y: 10 } }], onDragPair })} />);
    const marker = screen.getByRole("button", { name: "Move plan point 1" });
    fireEvent.pointerDown(marker, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(marker, { clientX: 33, clientY: 44, buttons: 1 });
    fireEvent.pointerUp(marker);
    fireEvent.pointerMove(marker, { clientX: 99, clientY: 99, buttons: 1 });
    expect(onDragPair).toHaveBeenCalledTimes(1);
    expect(onDragPair).toHaveBeenCalledWith(0, { x: 33, y: 44 });
  });

  it("marks a plan point that waits for the model", () => {
    render(<SitePlanWindow {...props({ pending: { x: 5, y: 5 } })} />);
    expect(screen.getByRole("img", { name: "Plan point waiting for its spot on the model" })).toBeInTheDocument();
  });
});
