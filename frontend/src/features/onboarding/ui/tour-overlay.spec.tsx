import { fireEvent, render, screen } from "@testing-library/react";
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
    // The dim is cut open over the anchor, so the control it lights is lit
    // rather than veiled at 60 % — the mock redraws it above the dim, and the
    // hole is what makes `elementFromPoint` answer the control.
    expect(screen.getByTestId("tour-dim").style.clipPath).toBe(
      "polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, " +
        "20px 20px, 20px 50px, 50px 50px, 50px 20px, 20px 20px)",
    );
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

  // A click beside the point is a reader trying to look past the tour, not a
  // "read it" — it used to advance, and the step was gone. Next says that.
  it("does nothing when the reader clicks the dimmed page", async () => {
    const next = vi.fn();
    anchor("reset-camera", { top: 20, left: 20, width: 30, height: 30 });
    render(<TourOverlay tour={tour({ next })} />);
    await userEvent.click(screen.getByTestId("tour-dim"));
    expect(next).not.toHaveBeenCalled();
  });

  it("keeps a tall card on screen by its measured height, not a budget", () => {
    // A four-line body runs past the old 190px budget; at 768 tall the card
    // was placed as if it fitted and ran off the bottom.
    const tall = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(300);
    anchor("reset-camera", { top: 600, left: 20, width: 30, height: 30 });
    render(<TourOverlay tour={tour()} />);
    expect(screen.getByTestId("tour-card")).toHaveStyle({ top: `${window.innerHeight - 300 - 12}px` });
    tall.mockRestore();
  });

  // The one first-run moment with a delight budget: the dim fades in, the
  // hole and the halo travel to the next control, the card arrives by step.
  it("moves between steps rather than teleporting, and keeps only the fades under reduced motion", () => {
    anchor("reset-camera", { top: 20, left: 20, width: 30, height: 30 });
    render(<TourOverlay tour={tour()} />);
    expect(screen.getByTestId("tour-dim")).toHaveClass(
      "transition-[opacity,clip-path]",
      "starting:opacity-0",
      "motion-reduce:transition-opacity",
    );
    expect(screen.getByTestId("tour-halo")).toHaveClass("transition-[top,left,width,height]", "motion-reduce:transition-none");
    expect(screen.getByTestId("tour-card")).toHaveClass(
      "transition-[opacity,translate]",
      "starting:opacity-0",
      "motion-safe:starting:translate-y-1",
    );
  });

  it("leaves the dim whole for a centred step — there is no control to light", () => {
    render(<TourOverlay tour={tour({ step: { ...VIEWER_TOUR_STEPS[0], center: true } })} />);
    expect(screen.getByTestId("tour-dim").style.clipPath).toBe("");
    expect(screen.queryByTestId("tour-halo")).toBeNull();
  });

  // The dim is not `inert` and the page under it stays in the tab order, so the
  // card has to hold focus itself or a keyboard reader tabs straight into the
  // control the tour is explaining.
  describe("as a modal dialog", () => {
    it("announces itself as modal and reads its body out as it changes", () => {
      anchor("reset-camera", { top: 20, left: 20, width: 30, height: 30 });
      render(<TourOverlay tour={tour()} />);
      const dialog = screen.getByRole("dialog", { name: "Tour step 3 of 8" });
      expect(dialog).toHaveAttribute("aria-modal", "true");
      expect(screen.getByText(/Frame the whole territory again/)).toHaveAttribute(
        "aria-live",
        "polite",
      );
    });

    it("puts focus on Next as soon as the step is up", () => {
      anchor("reset-camera", { top: 20, left: 20, width: 30, height: 30 });
      render(<TourOverlay tour={tour()} />);
      expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
    });

    it("moves focus back to Next when the step changes", async () => {
      anchor("reset-camera", { top: 20, left: 20, width: 30, height: 30 });
      anchor("measure", { top: 60, left: 20, width: 30, height: 30 });
      const view = render(<TourOverlay tour={tour()} />);
      await userEvent.click(screen.getByRole("button", { name: "Skip tour" }));
      expect(screen.getByRole("button", { name: "Skip tour" })).toHaveFocus();

      view.rerender(<TourOverlay tour={tour({ step: VIEWER_TOUR_STEPS[3], stepIndex: 3 })} />);
      expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
    });

    it("cycles Tab round the card's own three buttons rather than into the page", async () => {
      anchor("reset-camera", { top: 20, left: 20, width: 30, height: 30 });
      render(<TourOverlay tour={tour()} />);

      await userEvent.tab();
      expect(screen.getByRole("button", { name: "Skip tour" }), "Tab from Next must wrap").toHaveFocus();
      await userEvent.tab();
      expect(screen.getByRole("button", { name: "Back" })).toHaveFocus();
    });

    it("cycles Shift+Tab the other way", async () => {
      anchor("reset-camera", { top: 20, left: 20, width: 30, height: 30 });
      render(<TourOverlay tour={tour()} />);

      await userEvent.tab(); // Next -> Skip tour
      await userEvent.tab({ shift: true });
      expect(screen.getByRole("button", { name: "Next" }), "Shift+Tab from Skip tour must wrap").toHaveFocus();
    });

    // The dim swallows clicks but not the tab order, so focus can sit on the
    // very control the tour is explaining. Tab pulls it back into the card.
    it("pulls focus back out of the page behind the dim", async () => {
      const el = anchor("reset-camera", { top: 20, left: 20, width: 30, height: 30 });
      render(<TourOverlay tour={tour()} />);

      el.focus();
      expect(el).toHaveFocus();
      await userEvent.tab();
      expect(screen.getByRole("button", { name: "Skip tour" })).toHaveFocus();

      el.focus();
      await userEvent.tab({ shift: true });
      expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
    });

    it("steps over a Back that the first step disables", async () => {
      render(<TourOverlay tour={tour({ step: VIEWER_TOUR_STEPS[0], stepIndex: 0 })} />);
      expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
      await userEvent.tab({ shift: true }); // Next -> (Back is out) -> Skip tour
      expect(screen.getByRole("button", { name: "Skip tour" })).toHaveFocus();
    });
  });

  it("follows the anchor when the page scrolls under it", () => {
    const el = anchor("reset-camera", { top: 200, left: 20, width: 30, height: 30 });
    render(<TourOverlay tour={tour()} />);
    expect(screen.getByTestId("tour-halo")).toHaveStyle({ top: "194px" });

    el.getBoundingClientRect = () =>
      ({ top: 50, left: 20, width: 30, height: 30, right: 50, bottom: 80, x: 20, y: 50, toJSON: () => ({}) }) as DOMRect;
    fireEvent.scroll(window);
    expect(screen.getByTestId("tour-halo")).toHaveStyle({ top: "44px" });
  });

  it("renders nothing once the tour has ended", () => {
    const { container } = render(<TourOverlay tour={tour({ active: false, step: null })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
