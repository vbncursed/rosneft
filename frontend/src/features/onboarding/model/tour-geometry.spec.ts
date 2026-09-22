import { afterEach, describe, expect, it } from "vitest";
import { cardStyle, dimStyle, haloStyle, type Rect, scrollerOf, visibleRect } from "./tour-geometry";

// jsdom's window is 1024 × 768; the card is 320 wide with a 12 px gap.
const CENTRED = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

const made: HTMLElement[] = [];
afterEach(() => {
  while (made.length) made.pop()?.remove();
});

type Box = { top: number; left: number; width: number; height: number };

function el(box: Box, parent: HTMLElement = document.body, style: Partial<CSSStyleDeclaration> = {}) {
  const node = document.createElement("div");
  Object.assign(node.style, style);
  node.getBoundingClientRect = () =>
    ({
      ...box,
      right: box.left + box.width,
      bottom: box.top + box.height,
      x: box.left,
      y: box.top,
      toJSON: () => ({}),
    }) as DOMRect;
  parent.append(node);
  made.push(node);
  return node;
}

describe("cardStyle", () => {
  const rect = (r: Partial<Rect>): Rect => ({ top: 100, left: 100, width: 30, height: 30, ...r });

  it("centres the card of a step with no anchor", () => {
    expect(cardStyle(null, 190)).toEqual(CENTRED);
  });

  it("sits beside the anchor when the card fits to its right, kept on screen by its height", () => {
    expect(cardStyle(rect({}), 190)).toEqual({ top: 100, left: 142 });
    // 768 - 190 - 12 = 566.
    expect(cardStyle(rect({ top: 700 }), 190)).toEqual({ top: 566, left: 142 });
  });

  it("goes left of the anchor when the right edge leaves no room", () => {
    // 700 - 12 - 320 = 368.
    expect(cardStyle(rect({ top: 300, left: 700, width: 280 }), 190)).toEqual({ top: 300, left: 368 });
  });

  it("goes left of the scrolling panel, not over it, for a control at the panel's right edge", () => {
    // 600 - 12 - 320 = 268.
    expect(cardStyle(rect({ top: 150, left: 960, clipLeft: 600 }), 190)).toEqual({ top: 150, left: 268 });
  });

  it("drops below the anchor when it fits on neither side, clamped to the viewport", () => {
    expect(cardStyle(rect({ top: 20, left: 300, width: 500 }), 190)).toEqual({ top: 62, left: 300 });
    // A panel from x=0 leaves no room left of it either; 1024 - 320 - 12 = 692.
    expect(cardStyle(rect({ top: 20, left: 800, width: 220, clipLeft: 0 }), 190)).toEqual({ top: 62, left: 692 });
    expect(cardStyle(rect({ top: 20, left: -40, width: 1060 }), 190)).toEqual({ top: 62, left: 12 });
  });

  it("falls back to the centre when it fits neither beside nor below — by its measured height", () => {
    expect(cardStyle(rect({ top: 700, left: 300, width: 500 }), 190)).toEqual(CENTRED);
    expect(cardStyle(rect({ top: 20, left: 300, width: 500 }), 700)).toEqual(CENTRED);
  });
});

describe("dimStyle and haloStyle", () => {
  it("leaves the dim whole without an anchor, and cuts the anchor's box out of it with one", () => {
    expect(dimStyle(null)).toEqual({});
    expect(dimStyle({ top: 10, left: 20, width: 30, height: 40 }).clipPath).toBe(
      "polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, 20px 10px, 20px 50px, 50px 50px, 50px 10px, 20px 10px)",
    );
  });

  it("rings the anchor 6 px out on every side", () => {
    expect(haloStyle({ top: 10, left: 20, width: 30, height: 40 })).toEqual({ top: 4, left: 14, width: 42, height: 52 });
  });
});

describe("visibleRect", () => {
  const panelBox = { top: 100, left: 1000, width: 300, height: 400 };

  it("is the element's own box when nothing clips it", () => {
    expect(visibleRect(el({ top: 5, left: 6, width: 7, height: 8 }))).toEqual({
      top: 5,
      left: 6,
      width: 7,
      height: 8,
      clipLeft: undefined,
    });
  });

  it("clips a tall anchor to its scrolling panel, whose left edge the card keys on", () => {
    const panel = el(panelBox, document.body, { overflow: "auto" });
    const list = el({ top: 150, left: 1010, width: 280, height: 1200 }, panel);
    expect(visibleRect(list)).toEqual({ top: 150, left: 1010, width: 280, height: 350, clipLeft: 1000 });
  });

  it.each([
    [300, 126],
    [0, 100],
  ])("insets a scrolled panel's top by its scroll-padding (scrollTop %i)", (scrollTop, top) => {
    const panel = el(panelBox, document.body, { overflow: "auto", scrollPaddingTop: "26px" });
    Object.defineProperty(panel, "scrollTop", { value: scrollTop });
    const list = el({ top: 50, left: 1010, width: 280, height: 1200 }, panel);
    expect(visibleRect(list).top).toBe(top);
  });

  it("parks an anchor scrolled wholly out of its panel on the panel's edge, empty", () => {
    const panel = el(panelBox, document.body, { overflow: "auto" });
    const below = el({ top: 900, left: 1010, width: 280, height: 20 }, panel);
    expect(visibleRect(below)).toMatchObject({ top: 500, height: 0, width: 280 });
  });

  it("takes clipLeft from the nearest scrolling clipper, never from a hidden one", () => {
    const main = el({ top: 0, left: 0, width: 1024, height: 768 }, document.body, { overflow: "hidden" });
    expect(visibleRect(el({ top: 300, left: 700, width: 280, height: 20 }, main)).clipLeft).toBeUndefined();
    const panel = el({ top: 0, left: 600, width: 424, height: 768 }, main, { overflow: "scroll" });
    expect(visibleRect(el({ top: 300, left: 700, width: 280, height: 20 }, panel)).clipLeft).toBe(600);
  });
});

describe("scrollerOf", () => {
  function scroller(parent: HTMLElement, scrollHeight: number) {
    const node = el({ top: 0, left: 0, width: 100, height: 100 }, parent, { overflowY: "auto" });
    Object.defineProperty(node, "scrollHeight", { value: scrollHeight });
    Object.defineProperty(node, "clientHeight", { value: 400 });
    return node;
  }

  it("is the nearest vertical scroller with somewhere to go, skipping a full one", () => {
    const outer = scroller(document.body, 2000);
    const full = scroller(outer, 400);
    const leaf = el({ top: 0, left: 0, width: 10, height: 10 }, full);
    expect(scrollerOf(leaf)).toBe(outer);
    expect(scrollerOf(el({ top: 0, left: 0, width: 10, height: 10 }, outer))).toBe(outer);
  });

  it("is nothing when no ancestor scrolls, or there is no element", () => {
    const hidden = el({ top: 0, left: 0, width: 100, height: 100 }, document.body, { overflowY: "hidden" });
    Object.defineProperty(hidden, "scrollHeight", { value: 2000 });
    expect(scrollerOf(el({ top: 0, left: 0, width: 10, height: 10 }, hidden))).toBeNull();
    expect(scrollerOf(null)).toBeNull();
  });
});
