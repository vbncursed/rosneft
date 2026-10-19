// Run with: yarn test  (vitest + jsdom).
import { test, afterEach, vi } from "vitest";
import assert from "node:assert/strict";

import { act, renderHook } from "@testing-library/react";
import { isShortcutBlocked, useKeyboardShortcuts } from "./use-keyboard-shortcuts";

const mounted: (() => void)[] = [];
afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});

function bind(shortcuts: Record<string, () => void>) {
  const h = renderHook(() => useKeyboardShortcuts(shortcuts));
  mounted.push(h.unmount);
  return h;
}

function press(key: string, target?: Element, init: KeyboardEventInit = {}) {
  act(() => {
    (target ?? window).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
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

test("a held key fires once — auto-repeat keydowns are ignored", () => {
  // G flips the walk on and off, and a refused walk toasts: a key held down
  // must not repeat either of them.
  const g = vi.fn();
  bind({ g });
  press("g");
  press("g", undefined, { repeat: true });
  assert.equal(g.mock.calls.length, 1);
});

test("a Russian layout's M fires the m shortcut by its physical key", () => {
  // ЙЦУКЕН types "ь" on the key that is KeyM: the letter shortcuts answer by
  // position, as the free cam's WASD already does.
  const m = vi.fn();
  bind({ m });
  press("ь", undefined, { code: "KeyM" });
  assert.equal(m.mock.calls.length, 1);
});

test("a Latin M still fires once, not twice", () => {
  const m = vi.fn();
  bind({ m });
  press("m", undefined, { code: "KeyM" });
  assert.equal(m.mock.calls.length, 1);
});

test("Dvorak keeps its own letter: the c key fires c, not the j key under it", () => {
  const c = vi.fn();
  const j = vi.fn();
  bind({ c, j });
  press("c", undefined, { code: "KeyJ" });
  assert.equal(c.mock.calls.length, 1);
  assert.equal(j.mock.calls.length, 0);
});

test("a Latin letter with no handler does not fall back to the key beneath it", () => {
  // Dvorak's c sits on KeyJ: with only j bound, c must stay silent.
  const j = vi.fn();
  bind({ j });
  press("c", undefined, { code: "KeyJ" });
  assert.equal(j.mock.calls.length, 0);
});

test("a non-Latin key in a typing field is still blocked", () => {
  const m = vi.fn();
  bind({ m });
  const field = document.createElement("input");
  document.body.appendChild(field);
  press("ь", field, { code: "KeyM" });
  field.remove();
  assert.equal(m.mock.calls.length, 0);
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

test("ignores every key while a modal is open — the dialog owns them", () => {
  // Esc under an open ConfirmDialog cancelled the dialog AND ran the viewer's
  // escape ladder underneath it, which walked the reader out of the panorama
  // they were only trying to cancel a delete in. P, V and M acted behind an
  // open dialog the same way.
  const m = vi.fn();
  const escape = vi.fn();
  bind({ m, Escape: escape });
  const dialog = document.createElement("dialog");
  dialog.setAttribute("open", "");
  document.body.appendChild(dialog);

  press("m");
  press("Escape");
  dialog.remove();

  assert.equal(m.mock.calls.length, 0);
  assert.equal(escape.mock.calls.length, 0);
});

test("a closed dialog in the tree holds nothing back", () => {
  const m = vi.fn();
  bind({ m });
  const dialog = document.createElement("dialog");
  document.body.appendChild(dialog);
  press("m");
  dialog.remove();
  assert.equal(m.mock.calls.length, 1);
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

test("a key held with ⌘, Ctrl or Alt belongs to the browser, not the viewer", () => {
  const f = vi.fn();
  bind({ f });
  for (const mod of ["metaKey", "ctrlKey", "altKey"] as const) {
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "f", [mod]: true }));
    });
  }
  assert.equal(f.mock.calls.length, 0);
});

test("isShortcutBlocked: typing targets, an open dialog and modifiers", () => {
  const input = document.createElement("input");
  assert.equal(isShortcutBlocked(new KeyboardEvent("keydown", { key: "w" })), false);
  const typed = new KeyboardEvent("keydown", { key: "w" });
  Object.defineProperty(typed, "target", { value: input });
  assert.equal(isShortcutBlocked(typed), true);
  assert.equal(isShortcutBlocked(new KeyboardEvent("keydown", { key: "w", ctrlKey: true })), true);
  const dialog = document.createElement("dialog");
  dialog.setAttribute("open", "");
  document.body.append(dialog);
  assert.equal(isShortcutBlocked(new KeyboardEvent("keydown", { key: "w" })), true);
  dialog.remove();
});
