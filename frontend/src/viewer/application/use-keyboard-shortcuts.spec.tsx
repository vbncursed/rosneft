// Run with: yarn test:spa  (vitest + jsdom).
import { test, afterEach, vi } from "vitest";
import assert from "node:assert/strict";

import { renderHook, act } from "@/test-support/render-hook";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

const mounted: (() => void)[] = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function bind(shortcuts: Record<string, () => void>) {
  const h = renderHook(() => useKeyboardShortcuts(shortcuts));
  mounted.push(h.unmount);
  return h;
}

function press(key: string, target?: Element) {
  act(() => {
    (target ?? window).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

test("dispatches to the handler for the pressed key", () => {
  const m = vi.fn();
  bind({ m });
  press("m");
  assert.equal(m.mock.calls.length, 1);
});

test("character keys match case-insensitively — Shift+M is still M", () => {
  const m = vi.fn();
  bind({ m });
  press("M");
  assert.equal(m.mock.calls.length, 1);
});

test("named keys match literally", () => {
  const escape = vi.fn();
  bind({ Escape: escape });
  press("Escape");
  assert.equal(escape.mock.calls.length, 1);
});

test("an unbound key does nothing", () => {
  const m = vi.fn();
  bind({ m });
  press("q");
  assert.equal(m.mock.calls.length, 0);
});

test("only the matching handler fires", () => {
  const t = vi.fn();
  const r = vi.fn();
  bind({ t, r });
  press("t");
  assert.equal(t.mock.calls.length, 1);
  assert.equal(r.mock.calls.length, 0);
});

for (const tag of ["INPUT", "SELECT", "TEXTAREA"]) {
  test(`ignores keys typed into a ${tag} — number entry must not fire shortcuts`, () => {
    const s = vi.fn();
    bind({ s });
    const field = document.createElement(tag.toLowerCase());
    document.body.appendChild(field);
    press("s", field);
    field.remove();
    assert.equal(s.mock.calls.length, 0);
  });
}

test("still fires for a key pressed on a non-typing element", () => {
  const s = vi.fn();
  bind({ s });
  const div = document.createElement("div");
  document.body.appendChild(div);
  press("s", div);
  div.remove();
  assert.equal(s.mock.calls.length, 1);
});

test("a fresh handler map each render is picked up without re-binding", () => {
  // The map is read through a ref precisely so callers can pass an inline
  // object literal; a stale closure here would keep calling the first handler.
  const first = vi.fn();
  const second = vi.fn();
  let handler = first;
  const h = renderHook(() => useKeyboardShortcuts({ m: () => handler() }));
  mounted.push(h.unmount);
  handler = second;
  h.rerender();
  press("m");
  assert.equal(first.mock.calls.length, 0);
  assert.equal(second.mock.calls.length, 1);
});

test("unmounting removes the listener", () => {
  const m = vi.fn();
  const h = bind({ m });
  h.unmount();
  press("m");
  assert.equal(m.mock.calls.length, 0);
});
