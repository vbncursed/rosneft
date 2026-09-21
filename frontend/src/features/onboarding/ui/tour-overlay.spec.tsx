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

  // 500 wide at 300: the card fits neither to the right (1144 > 1024) nor to
  // the left (300 - 332 < 12).
  it("drops below the anchor when the card fits on neither side of it", () => {
    anchor("reset-camera", { top: 20, left: 300, width: 500, height: 30 });
    render(<TourOverlay tour={tour()} />);
    expect(screen.getByTestId("tour-card")).toHaveStyle({ top: "62px", left: "300px" });
  });

  it("falls back to the centre when the card fits neither beside nor below", () => {
    anchor("reset-camera", { top: 700, left: 300, width: 500, height: 30 });
    render(<TourOverlay tour={tour()} />);
    expect(screen.getByTestId("tour-card")).toHaveStyle({ top: "50%", left: "50%" });
    // The halo still marks the control — only the card gave up its place.
    expect(screen.getByTestId("tour-halo")).toHaveStyle({ top: "694px", left: "294px" });
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

  // A scroll is not a step change: the spotlight follows it 1:1, and animates
  // again only when the step moves on.
  it("follows a scroll with no transition, and transitions again on the next step", () => {
    const el = anchor("reset-camera", { top: 200, left: 20, width: 30, height: 30 });
    const { rerender } = render(<TourOverlay tour={tour()} />);
    const halo = () => screen.getByTestId("tour-halo");
    const dim = () => screen.getByTestId("tour-dim");

    fireEvent.scroll(window); // the anchor's box is unchanged: not the reader
    expect(halo().style.transition).toBe("");
    expect(dim().style.transition).toBe("");

    el.getBoundingClientRect = () =>
      ({ top: 50, left: 20, width: 30, height: 30, right: 50, bottom: 80, x: 20, y: 50, toJSON: () => ({}) }) as DOMRect;
    fireEvent.scroll(window);
    expect(halo().style.transition).toBe("none");
    expect(dim().style.transition).toBe("none");

    anchor("toggle-markers", { top: 300, left: 20, width: 30, height: 30 });
    rerender(<TourOverlay tour={tour({ step: VIEWER_TOUR_STEPS.find((s) => s.id === "toggle-markers") })} />);
    expect(halo().style.transition).toBe("");
    expect(dim().style.transition).toBe("");
  });

  // The token curve (--ease-out), not a hard-coded ease-in-out that leaves the
  // halo near-stationary for its first ~90 ms and arriving after the card.
  it("moves the halo and the dim's hole on the ease-out token", () => {
    anchor("reset-camera", { top: 20, left: 20, width: 30, height: 30 });
    render(<TourOverlay tour={tour()} />);
    for (const id of ["tour-halo", "tour-dim"]) {
      expect(screen.getByTestId(id)).toHaveClass("ease-out");
      expect(screen.getByTestId(id).className).not.toContain("cubic-bezier(0.77");
    }
  });

  it("renders nothing once the tour has ended", () => {
    const { container } = render(<TourOverlay tour={tour({ active: false, step: null })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("scrolls a panel step's control into view before measuring it", () => {
    const el = anchor("toggle-markers", { top: 900, left: 1700, width: 280, height: 20 });
    el.scrollIntoView = vi.fn();
    const step = VIEWER_TOUR_STEPS.find((s) => s.id === "toggle-markers");
    render(<TourOverlay tour={tour({ step })} />);

    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  // "nearest" on a list taller than its panel, scrolled past by the step
  // before, aligns the list's *bottom* — its first rows end up above the fold.
  it("aligns an anchor taller than its panel to the panel's top", () => {
    const panel = document.createElement("div");
    panel.style.overflowY = "auto";
    Object.defineProperty(panel, "scrollHeight", { value: 2000 });
    Object.defineProperty(panel, "clientHeight", { value: 400 });
    document.body.append(panel);
    anchors.push(panel);
    const el = anchor("panorama-picker", { top: -400, left: 1010, width: 280, height: 1200 });
    el.scrollIntoView = vi.fn();
    panel.append(el);
    const step = VIEWER_TOUR_STEPS.find((s) => s.id === "panorama-picker");
    render(<TourOverlay tour={tour({ step })} />);

    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("clips the spotlight to what the anchor's scrolling panel shows", () => {
    const panel = document.createElement("div");
    panel.style.overflow = "auto";
    panel.getBoundingClientRect = () =>
      ({ top: 100, left: 1000, width: 300, height: 400, right: 1300, bottom: 500, x: 1000, y: 100, toJSON: () => ({}) }) as DOMRect;
    document.body.append(panel);
    anchors.push(panel);
    // A list three times the panel's height, starting inside it.
    const el = anchor("panorama-picker", { top: 150, left: 1010, width: 280, height: 1200 });
    panel.append(el);
    const step = VIEWER_TOUR_STEPS.find((s) => s.id === "panorama-picker");
    render(<TourOverlay tour={tour({ step })} />);

    expect(screen.getByTestId("tour-halo")).toHaveStyle({
      top: "144px",
      left: "1004px",
      width: "292px",
      height: "362px",
    });
  });

  it("leaves fixed chrome and canvas anchors where they are", () => {
    const el = anchor("reset-camera", { top: 20, left: 20, width: 30, height: 30 });
    el.scrollIntoView = vi.fn();
    render(<TourOverlay tour={tour()} />);

    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it("puts the card to the anchor's left when the right edge leaves no room", () => {
    anchor("toggle-markers", { top: 300, left: 700, width: 280, height: 20 });
    const step = VIEWER_TOUR_STEPS.find((s) => s.id === "toggle-markers");
    render(<TourOverlay tour={tour({ step })} />);

    // 700 - 12 gap - 320 card = 368.
    expect(screen.getByTestId("tour-card")).toHaveStyle({ left: "368px", top: "300px" });
  });

  it("hands a wheel over the lit anchor to the panel it scrolls in", () => {
    const panel = document.createElement("div");
    // jsdom computes the `overflow` shorthand as "" for a longhand-only style,
    // so this panel scrolls without clipping the hole — the hole is the anchor.
    panel.style.overflowY = "auto";
    Object.defineProperty(panel, "scrollHeight", { value: 2000 });
    Object.defineProperty(panel, "clientHeight", { value: 400 });
    panel.scrollBy = vi.fn();
    document.body.append(panel);
    anchors.push(panel);
    const el = anchor("panorama-picker", { top: 100, left: 100, width: 200, height: 300 });
    panel.append(el);
    const step = VIEWER_TOUR_STEPS.find((s) => s.id === "panorama-picker");
    render(<TourOverlay tour={tour({ step })} />);

    // Chromium dispatches the wheel to the lit control (hit-testing honours
    // the hole) but scrolls the dim (scroll targeting does not) — so the
    // event is taken over and the native scroll cancelled.
    const native = fireEvent.wheel(el, { clientX: 150, clientY: 200, deltaY: 120 });
    expect(panel.scrollBy).toHaveBeenCalledWith({ top: 120, left: 0 });
    expect(native, "the native scroll must be cancelled").toBe(false);

    fireEvent.wheel(screen.getByTestId("tour-dim"), { clientX: 600, clientY: 600, deltaY: 120 });
    // A trackpad pinch (ctrlKey) and a sideways-only wheel are not scrolls of
    // the panel, and are left to the browser.
    expect(fireEvent.wheel(el, { clientX: 150, clientY: 200, deltaY: 120, ctrlKey: true })).toBe(true);
    expect(fireEvent.wheel(el, { clientX: 150, clientY: 200, deltaX: 80, deltaY: 0 })).toBe(true);
    expect(panel.scrollBy).toHaveBeenCalledTimes(1);
  });

  it("leaves a wheel over an anchor with nothing to scroll to the browser", () => {
    const el = anchor("reset-camera", { top: 20, left: 20, width: 30, height: 30 });
    render(<TourOverlay tour={tour()} />);
    expect(fireEvent.wheel(el, { clientX: 30, clientY: 30, deltaY: 120 })).toBe(true);
  });

  it("sets the card left of the panel, not over it, for a small control at its right edge", () => {
    const panel = document.createElement("div");
    panel.style.overflow = "auto";
    panel.getBoundingClientRect = () =>
      ({ top: 100, left: 600, width: 400, height: 600, right: 1000, bottom: 700, x: 600, y: 100, toJSON: () => ({}) }) as DOMRect;
    document.body.append(panel);
    anchors.push(panel);
    panel.append(anchor("toggle-markers", { top: 150, left: 960, width: 30, height: 30 }));
    const step = VIEWER_TOUR_STEPS.find((s) => s.id === "toggle-markers");
    render(<TourOverlay tour={tour({ step })} />);

    // 600 panel left - 12 gap - 320 card = 268; level with the control.
    expect(screen.getByTestId("tour-card")).toHaveStyle({ left: "268px", top: "150px" });
    // The halo is still the control's own box.
    expect(screen.getByTestId("tour-halo")).toHaveStyle({ left: "954px", width: "42px" });
  });

  // The viewer's <main> is overflow:hidden and starts at x=0; keyed on every
  // clipper, the card would be pushed "left of x=0" and fall below instead.
  it("measures the card's left edge against the scrolling panel, not a page-wide clip", () => {
    const main = document.createElement("div");
    main.style.overflow = "hidden";
    main.getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 1024, height: 768, right: 1024, bottom: 768, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    document.body.append(main);
    anchors.push(main);
    main.append(anchor("reset-camera", { top: 300, left: 700, width: 280, height: 20 }));
    render(<TourOverlay tour={tour()} />);

    expect(screen.getByTestId("tour-card")).toHaveStyle({ left: "368px", top: "300px" });
  });

  // The Overlays panel lays a 26 px "scrolled" strip over its own top once it
  // is scrolled, and declares that band as scroll-padding-top.
  it.each([
    [300, "120px"],
    [0, "94px"],
  ])("keeps the halo below a scrolled panel's scroll-padding (scrollTop %i)", (scrollTop, haloTop) => {
    const panel = document.createElement("div");
    panel.style.overflow = "auto";
    panel.style.scrollPaddingTop = "26px";
    Object.defineProperty(panel, "scrollTop", { value: scrollTop });
    panel.getBoundingClientRect = () =>
      ({ top: 100, left: 600, width: 400, height: 600, right: 1000, bottom: 700, x: 600, y: 100, toJSON: () => ({}) }) as DOMRect;
    document.body.append(panel);
    anchors.push(panel);
    panel.append(anchor("panorama-picker", { top: 50, left: 610, width: 380, height: 1200 }));
    const step = VIEWER_TOUR_STEPS.find((s) => s.id === "panorama-picker");
    render(<TourOverlay tour={tour({ step })} />);

    expect(screen.getByTestId("tour-halo")).toHaveStyle({ top: haloTop });
  });

  it("parks the halo on the panel's edge when the anchor is scrolled wholly out of it", () => {
    const panel = document.createElement("div");
    panel.style.overflow = "auto";
    panel.getBoundingClientRect = () =>
      ({ top: 100, left: 1000, width: 300, height: 400, right: 1300, bottom: 500, x: 1000, y: 100, toJSON: () => ({}) }) as DOMRect;
    document.body.append(panel);
    anchors.push(panel);
    panel.append(anchor("toggle-markers", { top: 900, left: 1010, width: 280, height: 20 }));
    const step = VIEWER_TOUR_STEPS.find((s) => s.id === "toggle-markers");
    render(<TourOverlay tour={tour({ step })} />);

    // Panel bottom 500 - 6 ring, not the anchor's own off-screen 900 - 6.
    expect(screen.getByTestId("tour-halo")).toHaveStyle({ top: "494px", height: "12px" });
  });
});
