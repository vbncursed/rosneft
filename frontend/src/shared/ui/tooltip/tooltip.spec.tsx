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
});

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
    const [a, b] = [screen.getByRole("button", { name: "A" }), screen.getByRole("button", { name: "B" })];
    fireEvent.pointerEnter(a, mouse);
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("tooltip").classList).toContain("starting:opacity-0");
    fireEvent.pointerLeave(a, mouse);
    act(() => vi.advanceTimersByTime(100));
    fireEvent.pointerEnter(b, mouse);
    expect(screen.getByRole("tooltip")).toHaveTextContent("B");
    expect(screen.getByRole("tooltip").classList).not.toContain("starting:opacity-0");
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
    const b = renderOne();
    fireEvent.pointerDown(b, mouse);
    fireEvent.focus(b);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.blur(b);
    fireEvent.focus(b);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByRole("tooltip").classList).not.toContain("starting:opacity-0");
  });

  it("stays shut on a focus the browser does not ring, like a dialog placing it", () => {
    focusVisible = false;
    const b = renderOne();
    fireEvent.focus(b);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on keyboard focus after the pointer that pressed it has left", () => {
    const b = renderOne();
    fireEvent.pointerDown(b, mouse);
    fireEvent.pointerLeave(b, mouse);
    fireEvent.focus(b);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("closes on Esc without letting the key reach listeners below", () => {
    const below = vi.fn();
    document.addEventListener("keydown", below);
    const b = renderOne();
    fireEvent.focus(b);
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
    fireEvent.focus(b);
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
    fireEvent.focus(b);
    expect(b.getAttribute("aria-describedby")).toBe(`hint ${screen.getByRole("tooltip").id}`);
    fireEvent.blur(b);
    expect(b.getAttribute("aria-describedby")).toBe("hint");
  });

  it("shows a shortcut as a keycap", () => {
    const b = renderOne("Measure", { shortcut: "M" });
    fireEvent.focus(b);
    expect(screen.getByRole("tooltip").querySelector("kbd")).toHaveTextContent("M");
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
