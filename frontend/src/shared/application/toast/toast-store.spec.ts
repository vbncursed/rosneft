// Run with: yarn test:spa  (vitest — the store is a module singleton driven by
// timers, and the module resolves through the `@/` alias).
import { test, beforeEach, afterEach, vi } from "vitest";
import assert from "node:assert/strict";

import { push, dismiss, subscribe, getSnapshot, getServerSnapshot } from "./toast-store";

beforeEach(() => {
  vi.useFakeTimers();
  for (const t of getSnapshot()) dismiss(t.id);
});
afterEach(() => vi.useRealTimers());

test("push stores the toast and returns its id", () => {
  const id = push("error", "boom");
  assert.deepEqual(getSnapshot(), [{ id, kind: "error", message: "boom" }]);
});

test("newest toasts land on top", () => {
  push("info", "first");
  push("info", "second");
  assert.deepEqual(getSnapshot().map((t) => t.message), ["second", "first"]);
});

test("ids are unique across pushes, including after a dismiss", () => {
  const a = push("info", "a");
  dismiss(a);
  const b = push("info", "b");
  assert.notEqual(a, b);
});

test("a toast dismisses itself after 5 seconds", () => {
  push("info", "transient");
  vi.advanceTimersByTime(4999);
  assert.equal(getSnapshot().length, 1);
  vi.advanceTimersByTime(1);
  assert.equal(getSnapshot().length, 0);
});

test("each toast keeps its own 5s clock", () => {
  push("info", "first");
  vi.advanceTimersByTime(3000);
  push("info", "second");
  vi.advanceTimersByTime(2000); // first expires, second has 3s left
  assert.deepEqual(getSnapshot().map((t) => t.message), ["second"]);
});

test("dismiss removes only the named toast", () => {
  const a = push("info", "a");
  push("info", "b");
  dismiss(a);
  assert.deepEqual(getSnapshot().map((t) => t.message), ["b"]);
});

test("dismissing an unknown id keeps the same snapshot reference", () => {
  push("info", "a");
  const before = getSnapshot();
  dismiss(9999);
  // useSyncExternalStore tears if getSnapshot returns a fresh array for a
  // no-op, so identity matters here, not just contents.
  assert.equal(getSnapshot(), before);
});

test("the auto-dismiss timer of an already-dismissed toast is harmless", () => {
  const id = push("info", "a");
  dismiss(id);
  push("info", "b");
  const before = getSnapshot();
  vi.advanceTimersByTime(5000);
  assert.equal(getSnapshot().length, 0, "b expires on its own clock");
  assert.notEqual(before, getSnapshot());
});

test("the snapshot reference changes on every real mutation", () => {
  const before = getSnapshot();
  push("info", "a");
  assert.notEqual(getSnapshot(), before);
});

test("subscribers are notified on push and on dismiss", () => {
  let calls = 0;
  const unsubscribe = subscribe(() => calls++);
  const id = push("info", "a");
  assert.equal(calls, 1);
  dismiss(id);
  assert.equal(calls, 2);
  unsubscribe();
});

test("unsubscribing stops the notifications", () => {
  let calls = 0;
  subscribe(() => calls++)();
  push("info", "a");
  assert.equal(calls, 0);
});

test("the same listener subscribed twice is still notified once", () => {
  // Listeners live in a Set, so a re-subscribe must not double-fire.
  let calls = 0;
  const listener = () => calls++;
  const off1 = subscribe(listener);
  const off2 = subscribe(listener);
  push("info", "a");
  assert.equal(calls, 1);
  off1();
  off2();
});

test("getServerSnapshot is a stable empty stack", () => {
  push("info", "a");
  assert.deepEqual(getServerSnapshot(), []);
  assert.equal(getServerSnapshot(), getServerSnapshot());
});
