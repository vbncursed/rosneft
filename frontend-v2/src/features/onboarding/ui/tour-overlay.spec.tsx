import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tour } from "../model/use-tour";
import { VIEWER_TOUR_STEPS } from "../model/viewer-tour-steps";
import { TourOverlay } from "./tour-overlay";

const anchors: HTMLElement[] = [];
afterEach(() => {
  while (anchors.length) anchors.pop()?.remove();
});

function anchor(id: string, box: { top: number; left: number; width: number; height: number }) {
  const el = document.createElement("button");
  el.dataset.tour = id;
  document.body.append(el);
  anchors.push(el);
  el.getBoundingClientRect = () =>
    ({
      ...box,
      right: box.left + box.width,
      bottom: box.top + box.height,
      x: box.left,
      y: box.top,
      toJSON: () => ({}),
    }) as DOMRect;
  return el;
}

const tour = (over: Partial<Tour> = {}): Tour => ({
  active: true,
  step: VIEWER_TOUR_STEPS[2],
  stepIndex: 2,
  total: 8,
  isLast: false,
  next: vi.fn(),
  prev: vi.fn(),
  skip: vi.fn(),
  restart: vi.fn(),
  ...over,
});

describe("TourOverlay", () => {
  it("dims the page, lifts the anchor, and places the tooltip beside it", () => {
    anchor("reset-camera", { top: 20, left: 20, width: 30, height: 30 });
    render(<TourOverlay tour={tour()} />);

    expect(screen.getByRole("dialog", { name: "Tour step 3 of 8" })).toBeInTheDocument();
    expect(screen.getByText("Reset the camera")).toBeInTheDocument();
    expect(screen.getByTestId("tour-dim")).toBeInTheDocument();
    // The halo is the anchor's own box grown by the 6 px ring.
    expect(screen.getByTestId("tour-halo")).toHaveStyle({
      top: "14px",
      left: "14px",
      width: "42px",
      height: "42px",
    });
    // Beside it: left edge one gap right of the anchor, top level with it.
    expect(screen.getByTestId("tour-card")).toHaveStyle({ top: "20px", left: "62px" });
  });

  it("skips a step whose anchor is not on screen", () => {
    const next = vi.fn();
    render(<TourOverlay tour={tour({ next })} />);
    expect(next).toHaveBeenCalledOnce();
  });

  it("centres a step that describes the page, and lights nothing up", () => {
    render(<TourOverlay tour={tour({ step: VIEWER_TOUR_STEPS[0], stepIndex: 0 })} />);
    expect(screen.queryByTestId("tour-halo")).not.toBeInTheDocument();
    expect(screen.getByTestId("tour-card")).toHaveStyle({ top: "50%", left: "50%" });
  });

  it("drops below the anchor when the card would run off the right edge", () => {
    anchor("reset-camera", { top: 20, left: 900, width: 30, height: 30 });
    render(<TourOverlay tour={tour()} />);
    expect(screen.getByTestId("tour-card")).toHaveStyle({ top: "62px", left: "692px" });
  });

  it("falls back to the centre when the card fits neither beside nor below", () => {
    anchor("reset-camera", { top: 700, left: 900, width: 30, height: 30 });
    render(<TourOverlay tour={tour()} />);
    expect(screen.getByTestId("tour-card")).toHaveStyle({ top: "50%", left: "50%" });
    // The halo still marks the control — only the card gave up its place.
    expect(screen.getByTestId("tour-halo")).toHaveStyle({ top: "694px", left: "894px" });
  });

  it("advances when the reader clicks the dimmed page rather than the control", async () => {
    const next = vi.fn();
    anchor("reset-camera", { top: 20, left: 20, width: 30, height: 30 });
    render(<TourOverlay tour={tour({ next })} />);
    await userEvent.click(screen.getByTestId("tour-dim"));
    expect(next).toHaveBeenCalledOnce();
  });

  it("renders nothing once the tour has ended", () => {
    const { container } = render(<TourOverlay tour={tour({ active: false, step: null })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
