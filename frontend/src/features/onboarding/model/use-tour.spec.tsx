import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TourStep } from "./tour-step";

const markTourSeen = vi.fn();
vi.mock("../api/tours-gateway", () => ({
  markTourSeen: (id: string) => markTourSeen(id),
}));

const { useTour } = await import("./use-tour");

const STEPS: TourStep[] = [
  { id: "one", title: "One", body: "first" },
  { id: "two", title: "Two", body: "second" },
  { id: "three", title: "Three", body: "third" },
];

// The hook remembers finished tours in a module-level Set, so every test needs
// its own id or the previous test's completion suppresses this one's start.
let n = 0;
const freshId = () => `tour-${n++}`;

function tour(opts: { seen?: boolean; ready?: boolean; id?: string } = {}) {
  const id = opts.id ?? freshId();
  let ready = opts.ready ?? true;
  const hook = renderHook(() => useTour(id, STEPS, { seen: opts.seen ?? false, ready }));
  return {
    ...hook,
    id,
    setReady: (value: boolean) => {
      ready = value;
      act(() => hook.rerender());
    },
  };
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

beforeEach(() => markTourSeen.mockReset().mockResolvedValue(undefined));
afterEach(() => vi.restoreAllMocks());

describe("useTour", () => {
  it("opens an unseen, ready tour on its first step", () => {
    const { result } = tour();
    expect(result.current.active).toBe(true);
    expect(result.current.step?.id).toBe("one");
    expect(result.current.isLast).toBe(false);
  });

  it("counts the steps so the tooltip can say where the reader is", () => {
    const { result } = tour();
    expect(result.current.stepIndex).toBe(0);
    expect(result.current.total).toBe(3);
    act(() => result.current.next());
    expect(result.current.stepIndex).toBe(1);
  });

  it("never starts a tour the user has already seen", () => {
    const { result } = tour({ seen: true });
    expect(result.current.active).toBe(false);
    expect(result.current.step).toBeNull();
  });

  it("waits while the tour is not ready, then starts when it becomes ready", () => {
    const t = tour({ ready: false });
    expect(t.result.current.active).toBe(false);
    t.setReady(true);
    expect(t.result.current.active).toBe(true);
    expect(t.result.current.step?.id).toBe("one");
  });

  it("walks forward and flags the final step", () => {
    const { result } = tour();
    act(() => result.current.next());
    expect(result.current.step?.id).toBe("two");
    act(() => result.current.next());
    expect(result.current.step?.id).toBe("three");
    expect(result.current.isLast).toBe(true);
  });

  it("ends the tour when next passes the last step", () => {
    const { result } = tour();
    for (let i = 0; i < 3; i++) act(() => result.current.next());
    expect(result.current.active).toBe(false);
    expect(result.current.step).toBeNull();
  });

  it("walks back and stops at the first step", () => {
    const { result } = tour();
    act(() => result.current.next());
    act(() => result.current.prev());
    expect(result.current.step?.id).toBe("one");
    act(() => result.current.prev());
    expect(result.current.step?.id, "back from the first step must not close the tour").toBe("one");
    expect(result.current.active).toBe(true);
  });

  it("skips out immediately", () => {
    const { result } = tour();
    act(() => result.current.skip());
    expect(result.current.active).toBe(false);
  });

  it("marks the tour seen on the server exactly once", () => {
    const { result, id } = tour();
    act(() => result.current.skip());
    expect(markTourSeen.mock.calls).toEqual([[id]]);
    act(() => result.current.restart());
    act(() => result.current.skip());
    expect(markTourSeen.mock.calls.length, "a replay must not re-POST").toBe(1);
  });

  it("never marks a tour that did not open", () => {
    tour({ seen: true });
    expect(markTourSeen).not.toHaveBeenCalled();
  });

  it("swallows a failing POST — the worst case is a replay next login", () => {
    // A thenable rather than a real rejected promise: the assertion is that the
    // hook attaches a handler at all, and an actual rejection would be flagged
    // by the runner before the hook could catch it.
    const onCatch = vi.fn();
    markTourSeen.mockReturnValue({ catch: onCatch });
    const { result } = tour();
    act(() => result.current.skip());
    expect(result.current.active).toBe(false);
    expect(onCatch, "an uncaught POST failure would crash the tour").toHaveBeenCalledOnce();
  });

  it("does not replay a finished tour when the component remounts", () => {
    const id = freshId();
    const first = tour({ id });
    act(() => first.result.current.skip());
    const second = tour({ id });
    expect(second.result.current.active, "leaving the page and coming back replayed it").toBe(false);
  });

  it("reopens a seen tour at the first step on restart", () => {
    const { result } = tour({ seen: true });
    act(() => result.current.restart());
    expect(result.current.active).toBe(true);
    expect(result.current.step?.id).toBe("one");
  });

  it("skips on Escape and steps back and forth on the arrows", () => {
    const { result } = tour();
    press("ArrowRight");
    expect(result.current.step?.id).toBe("two");
    press("ArrowLeft");
    expect(result.current.step?.id).toBe("one");
    press("Escape");
    expect(result.current.active).toBe(false);
  });

  it("leaves Enter alone so it activates whatever button has focus", () => {
    const { result } = tour();
    press("Enter");
    expect(result.current.step?.id).toBe("one");
  });

  it("stops keys reaching the viewer's own shortcuts while the tour is up", () => {
    const seen: string[] = [];
    const spy = (event: Event) => seen.push((event as KeyboardEvent).key);
    window.addEventListener("keydown", spy);
    const { result } = tour();
    press("m"); // the measure-tool hotkey
    expect(seen, "M fired behind the overlay").toEqual([]);
    act(() => result.current.skip());
    press("m");
    window.removeEventListener("keydown", spy);
    expect(seen, "keys must flow again once the tour closes").toEqual(["m"]);
  });
});
