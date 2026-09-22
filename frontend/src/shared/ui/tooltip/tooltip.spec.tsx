import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Tooltip } from "./tooltip";
import { resetTooltipWarmup } from "./use-tooltip";

const mouse = { pointerType: "mouse" };
// jsdom answers `:focus-visible` with false for every focus — a browser's answer
// for a programmatic one. The specs say which kind of focus they mean.
let focusVisible = true;
const matches = Element.prototype.matches;
beforeEach(() => {
  vi.useFakeTimers();
  resetTooltipWarmup();
  focusVisible = true;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
    return selector === ":focus-visible" ? focusVisible : matches.call(this, selector);
  });
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
});

/** A keyboard user arriving: the Tab, then the focus it brings. */
function tabTo(el: Element) {
  fireEvent.keyDown(el, { key: "Tab" });
  fireEvent.focus(el);
}

/** jsdom has no WAAPI; the drift is observed through this stand-in. */
function stubAnimate() {
  const animate = vi.fn();
  HTMLElement.prototype.animate = animate;
  return animate;
}

// jsdom lays nothing out: the trigger gets `box`, the tooltip 10 px per character.
function stubRects(box: { top: number; left: number; width: number; height: number }) {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const r = this.getAttribute("role") === "tooltip" ? { ...box, width: (this.textContent?.length ?? 0) * 10, height: 20 } : box;
    return { ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => r } as DOMRect;
  });
}

function renderOne(label = "Measure", extra: Partial<Parameters<typeof Tooltip>[0]> = {}) {
  render(
    <Tooltip label={label} {...extra}>
      <button aria-label={label}>i</button>
    </Tooltip>,
  );
  return screen.getByRole("button", { name: label });
}

describe("Tooltip", () => {
  it("opens after 500 ms of mouse hover, not before", () => {
    const b = renderOne();
    fireEvent.pointerEnter(b, mouse);
    act(() => vi.advanceTimersByTime(499));
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Measure");
  });

  it("describes the trigger only while open", () => {
    const b = renderOne();
    expect(b).not.toHaveAttribute("aria-describedby");
    fireEvent.pointerEnter(b, mouse);
    act(() => vi.advanceTimersByTime(500));
    expect(b.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id);
    fireEvent.pointerLeave(b, mouse);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(b).not.toHaveAttribute("aria-describedby");
  });

  it("opens the next one instantly, without the enter animation, within 300 ms of the last closing", () => {
    render(
      <>
        <Tooltip label="A">
          <button aria-label="A" />
        </Tooltip>
        <Tooltip label="B">
          <button aria-label="B" />
        </Tooltip>
      </>,
    );
    const animate = stubAnimate();
    const [a, b] = [screen.getByRole("button", { name: "A" }), screen.getByRole("button", { name: "B" })];
    fireEvent.pointerEnter(a, mouse);
    act(() => vi.advanceTimersByTime(500));
    expect(animate).toHaveBeenCalledTimes(1);
    fireEvent.pointerLeave(a, mouse);
    act(() => vi.advanceTimersByTime(100));
    fireEvent.pointerEnter(b, mouse);
    expect(screen.getByRole("tooltip")).toHaveTextContent("B");
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("stays warm when the pointer leaves one trigger and enters the next in the same tick", () => {
    render(
      <>
        <Tooltip label="A">
          <button aria-label="A" />
        </Tooltip>
        <Tooltip label="B">
          <button aria-label="B" />
        </Tooltip>
      </>,
    );
    const [a, b] = [screen.getByRole("button", { name: "A" }), screen.getByRole("button", { name: "B" })];
    fireEvent.pointerEnter(a, mouse);
    act(() => vi.advanceTimersByTime(500));
    // One outer act batches both: React renders only after the pair, as it
    // may when a real pointer jumps straight from one trigger onto the next.
    act(() => {
      fireEvent.pointerLeave(a, mouse);
      fireEvent.pointerEnter(b, mouse);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("B");
  });

  it("waits the full delay again once the warm-up has passed", () => {
    render(
      <>
        <Tooltip label="A">
          <button aria-label="A" />
        </Tooltip>
        <Tooltip label="B">
          <button aria-label="B" />
        </Tooltip>
      </>,
    );
    const [a, b] = [screen.getByRole("button", { name: "A" }), screen.getByRole("button", { name: "B" })];
    fireEvent.pointerEnter(a, mouse);
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerLeave(a, mouse);
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerEnter(b, mouse);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("never opens for touch or pen", () => {
    const b = renderOne();
    fireEvent.pointerEnter(b, { pointerType: "touch" });
    fireEvent.pointerEnter(b, { pointerType: "pen" });
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens at once, unanimated, on keyboard focus but not on the focus a click brings", () => {
    const animate = stubAnimate();
    const b = renderOne();
    fireEvent.pointerDown(b, mouse);
    tabTo(b);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.blur(b);
    tabTo(b);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(animate).not.toHaveBeenCalled();
  });

  it("stays shut on a focus the browser does not ring, like a dialog placing it", () => {
    focusVisible = false;
    const b = renderOne();
    tabTo(b);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on keyboard focus after the pointer that pressed it has left", () => {
    const b = renderOne();
    fireEvent.pointerDown(b, mouse);
    fireEvent.pointerLeave(b, mouse);
    tabTo(b);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("closes on Esc without letting the key reach listeners below", () => {
    const below = vi.fn();
    const b = renderOne();
    tabTo(b);
    document.addEventListener("keydown", below);
    const handled = !fireEvent.keyDown(b, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(below).not.toHaveBeenCalled();
    expect(handled).toBe(true);
    fireEvent.keyDown(b, { key: "Escape" });
    expect(below).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", below);
  });

  it("closes when the trigger is pressed and keeps the child's own handlers", () => {
    const onClick = vi.fn();
    const onFocus = vi.fn();
    render(
      <Tooltip label="Go">
        <button aria-label="Go" onClick={onClick} onFocus={onFocus} />
      </Tooltip>,
    );
    const b = screen.getByRole("button", { name: "Go" });
    tabTo(b);
    fireEvent.pointerDown(b, mouse);
    fireEvent.click(b);
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it("keeps the child's own ref", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Tooltip label="Go">
        <button ref={ref} aria-label="Go" />
      </Tooltip>,
    );
    expect(ref.current).toBe(screen.getByRole("button", { name: "Go" }));
  });

  it("keeps a description the child already has", () => {
    render(
      <Tooltip label="Go">
        <button aria-label="Go" aria-describedby="hint" />
      </Tooltip>,
    );
    const b = screen.getByRole("button", { name: "Go" });
    tabTo(b);
    expect(b.getAttribute("aria-describedby")).toBe(`hint ${screen.getByRole("tooltip").id}`);
    fireEvent.blur(b);
    expect(b.getAttribute("aria-describedby")).toBe("hint");
  });

  it("shows a shortcut as a keycap", () => {
    const b = renderOne("Measure", { shortcut: "M" });
    tabTo(b);
    expect(screen.getByRole("tooltip").querySelector("kbd")).toHaveTextContent("M");
  });

  it("closes when anything scrolls, a panel included, or the window resizes", () => {
    render(
      <div data-testid="panel">
        <Tooltip label="Go">
          <button aria-label="Go" />
        </Tooltip>
      </div>,
    );
    const b = screen.getByRole("button", { name: "Go" });
    tabTo(b);
    act(() => vi.advanceTimersByTime(20));
    fireEvent.scroll(screen.getByTestId("panel"));
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.blur(b);
    tabTo(b);
    act(() => vi.advanceTimersByTime(20));
    fireEvent(window, new Event("resize"));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("survives the scroll a focus brings, in the frame it opens", () => {
    const b = renderOne();
    tabTo(b);
    fireEvent.scroll(document);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("measures again when its label changes while open", () => {
    stubRects({ top: 400, left: 900, width: 30, height: 30 });
    const { rerender } = render(
      <Tooltip label="On">
        <button aria-label="Toggle" />
      </Tooltip>,
    );
    tabTo(screen.getByRole("button", { name: "Toggle" }));
    const before = screen.getByRole("tooltip").style.left;
    rerender(
      <Tooltip label="Off, and a good deal longer">
        <button aria-label="Toggle" />
      </Tooltip>,
    );
    expect(screen.getByRole("tooltip").style.left).not.toBe(before);
    // 270 px wide now: centred it would overrun the right edge, so it is clamped.
    expect(screen.getByRole("tooltip").style.left).toBe(`${window.innerWidth - 8 - 270}px`);
  });

  it("drifts in from the side it finally took, not the one it was asked for", () => {
    stubRects({ top: 2, left: 400, width: 30, height: 30 });
    const animate = stubAnimate();
    const b = renderOne("Measure");
    fireEvent.pointerEnter(b, mouse);
    act(() => vi.advanceTimersByTime(500));
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0][0][0]).toEqual({ opacity: 0, translate: "0 -2px" });
  });

  it("does not play the drift again when it re-measures", () => {
    stubRects({ top: 400, left: 400, width: 30, height: 30 });
    const animate = stubAnimate();
    const { rerender } = render(
      <Tooltip label="On">
        <button aria-label="Toggle" />
      </Tooltip>,
    );
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Toggle" }), mouse);
    act(() => vi.advanceTimersByTime(500));
    rerender(
      <Tooltip label="Off">
        <button aria-label="Toggle" />
      </Tooltip>,
    );
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0][0][0]).toEqual({ opacity: 0, translate: "0 2px" });
  });

  it("fades without drifting under reduced motion", () => {
    const animate = stubAnimate();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const b = renderOne();
    fireEvent.pointerEnter(b, mouse);
    act(() => vi.advanceTimersByTime(500));
    expect(animate.mock.calls[0][0][0]).toEqual({ opacity: 0, translate: "0 0" });
  });

  it("still explains a disabled button, through a wrapper that takes the hover", () => {
    render(
      <Tooltip label="Remove its placements first">
        <button aria-label="Delete" disabled />
      </Tooltip>,
    );
    const button = screen.getByRole("button", { name: "Delete" });
    const wrapper = button.parentElement!;
    expect(wrapper.tagName).toBe("SPAN");
    fireEvent.pointerEnter(wrapper, mouse);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Remove its placements first");
    expect(button.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id);
  });
});
