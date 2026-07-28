// Run with: yarn test:spa  (vitest + jsdom).
import { test, beforeEach, afterEach, vi } from "vitest";
import assert from "node:assert/strict";

const markTourSeen = vi.fn();
vi.mock("@/auth/infrastructure/auth-gateway", () => ({
  markTourSeen: (id: string) => markTourSeen(id),
}));

const { renderHook, act } = await import("@/test-support/render-hook");
const { useTour } = await import("./use-tour");
type TourStep = import("@/onboarding/domain/tour-step").TourStep;

const STEPS: TourStep[] = [
  { id: "one", title: "One", body: "first" },
  { id: "two", title: "Two", body: "second" },
  { id: "three", title: "Three", body: "third" },
];

// The hook remembers finished tours in a module-level Set, so every test needs
// its own id or the previous test's completion suppresses this one's start.
let n = 0;
const freshId = () => `tour-${n++}`;

const mounted: (() => void)[] = [];
function tour(opts: { seen?: boolean; ready?: boolean; id?: string } = {}) {
  const id = opts.id ?? freshId();
  let ready = opts.ready ?? true;
  const h = renderHook(() => useTour(id, STEPS, { seen: opts.seen ?? false, ready }));
  mounted.push(h.unmount);
  return { ...h, id, setReady: (v: boolean) => { ready = v; h.rerender(); } };
}

function press(key: string) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

beforeEach(() => markTourSeen.mockReset().mockResolvedValue(undefined));
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

test("an unseen, ready tour opens on its first step", () => {
  const { result } = tour();
  assert.equal(result.current.active, true);
  assert.equal(result.current.step?.id, "one");
  assert.equal(result.current.isLast, false);
});

test("a tour the user has already seen never starts", () => {
  const { result } = tour({ seen: true });
  assert.equal(result.current.active, false);
  assert.equal(result.current.step, null);
});

test("a tour that is not ready waits, then starts when it becomes ready", () => {
  // The panorama tour is only ready once a panorama is open.
  const t = tour({ ready: false });
  assert.equal(t.result.current.active, false);
  t.setReady(true);
  assert.equal(t.result.current.active, true);
  assert.equal(t.result.current.step?.id, "one");
});

test("next walks forward and flags the final step", () => {
  const { result } = tour();
  act(() => result.current.next());
  assert.equal(result.current.step?.id, "two");
  act(() => result.current.next());
  assert.equal(result.current.step?.id, "three");
  assert.equal(result.current.isLast, true);
});

test("next past the last step ends the tour", () => {
  const { result } = tour();
  for (let i = 0; i < 3; i++) act(() => result.current.next());
  assert.equal(result.current.active, false);
  assert.equal(result.current.step, null);
});

test("prev walks back and stops at the first step", () => {
  const { result } = tour();
  act(() => result.current.next());
  act(() => result.current.prev());
  assert.equal(result.current.step?.id, "one");
  act(() => result.current.prev());
  assert.equal(result.current.step?.id, "one", "back from the first step must not close the tour");
  assert.equal(result.current.active, true);
});

test("skip ends the tour immediately", () => {
  const { result } = tour();
  act(() => result.current.skip());
  assert.equal(result.current.active, false);
});

test("finishing marks the tour seen on the server exactly once", () => {
  const { result, id } = tour();
  act(() => result.current.skip());
  assert.deepEqual(markTourSeen.mock.calls, [[id]]);
  act(() => result.current.restart());
  act(() => result.current.skip());
  assert.equal(markTourSeen.mock.calls.length, 1, "a replay must not re-POST");
});

test("a tour that never opened is never marked seen", () => {
  tour({ seen: true });
  assert.equal(markTourSeen.mock.calls.length, 0);
});

test("a failing POST is swallowed — the worst case is a replay next login", () => {
  // Returns a thenable rather than a real rejected promise: the assertion is
  // that the hook attaches a handler at all, and an actual rejection would be
  // flagged by the runner before the hook could catch it.
  const onCatch = vi.fn();
  markTourSeen.mockReturnValue({ catch: onCatch });
  const { result } = tour();
  act(() => result.current.skip());
  assert.equal(result.current.active, false);
  assert.equal(onCatch.mock.calls.length, 1, "an uncaught POST failure would crash the tour");
});

test("a finished tour does not replay when the component remounts", () => {
  const id = freshId();
  const first = tour({ id });
  act(() => first.result.current.skip());
  const second = tour({ id });
  assert.equal(second.result.current.active, false, "leaving the page and coming back replayed it");
});

test("restart reopens a seen tour at the first step", () => {
  const { result } = tour({ seen: true });
  act(() => result.current.restart());
  assert.equal(result.current.active, true);
  assert.equal(result.current.step?.id, "one");
});

test("Escape skips, arrows step back and forth", () => {
  const { result } = tour();
  press("ArrowRight");
  assert.equal(result.current.step?.id, "two");
  press("ArrowLeft");
  assert.equal(result.current.step?.id, "one");
  press("Escape");
  assert.equal(result.current.active, false);
});

test("Enter is left alone so it activates whatever button has focus", () => {
  const { result } = tour();
  press("Enter");
  assert.equal(result.current.step?.id, "one");
});

test("keys stop reaching the viewer's own shortcuts while the tour is up", () => {
  const seen: string[] = [];
  const spy = (e: Event) => seen.push((e as KeyboardEvent).key);
  window.addEventListener("keydown", spy);
  const { result } = tour();
  press("m"); // the measure-tool hotkey
  assert.deepEqual(seen, [], "M fired behind the overlay");
  act(() => result.current.skip());
  press("m");
  window.removeEventListener("keydown", spy);
  assert.deepEqual(seen, ["m"], "keys must flow again once the tour closes");
});
