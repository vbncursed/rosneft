import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHeldKeys } from "./use-held-keys";

const press = (type: "keydown" | "keyup", code: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  const e = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};

/** The rig's `walking` ref: set while walking, null otherwise. */
const walkingRef = (on: boolean) => ({ current: on ? {} : null });

afterEach(() => document.body.replaceChildren());

describe("useHeldKeys", () => {
  it("holds a move key until its release, and reports each press", () => {
    const onPress = vi.fn();
    const { result } = renderHook(() => useHeldKeys(onPress, walkingRef(false)));
    press("keydown", "KeyW");
    expect(result.current.current.has("KeyW")).toBe(true);
    expect(onPress).toHaveBeenCalledOnce();
    press("keyup", "KeyW");
    expect(result.current.current.size).toBe(0);
  });

  it("ignores keys that move nothing, with a modifier, typed into a field or under an open dialog", () => {
    const onPress = vi.fn();
    const { result } = renderHook(() => useHeldKeys(onPress, walkingRef(true)));
    press("keydown", "KeyF");
    press("keydown", "KeyW", { ctrlKey: true });
    const input = document.createElement("input");
    document.body.append(input);
    press("keydown", "KeyW", {}, input);
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    press("keydown", "KeyW");
    expect(result.current.current.size).toBe(0);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("drops every key on ⌘ and when the window loses focus", () => {
    const { result } = renderHook(() => useHeldKeys(vi.fn(), walkingRef(true)));
    press("keydown", "KeyW");
    press("keydown", "MetaLeft", { key: "Meta", metaKey: true });
    expect(result.current.current.size).toBe(0);
    press("keydown", "KeyW");
    press("keydown", "Space");
    window.dispatchEvent(new Event("blur"));
    expect(result.current.current.size).toBe(0);
  });

  it("takes Space only while it can jump, and keeps it from the page then", () => {
    const walking = walkingRef(false);
    const { result } = renderHook(() => useHeldKeys(vi.fn(), walking));
    expect(press("keydown", "Space").defaultPrevented).toBe(false);
    expect(result.current.current.has("Space")).toBe(false);
    walking.current = {};
    expect(press("keydown", "Space").defaultPrevented).toBe(true);
    expect(result.current.current.has("Space")).toBe(true);
    expect(press("keyup", "Space").defaultPrevented).toBe(true);
  });

  it("keyup does not drop a latched Space: the rig takes it on its next frame", () => {
    const { result } = renderHook(() => useHeldKeys(vi.fn(), walkingRef(true)));
    press("keydown", "Space");
    press("keyup", "Space");
    expect(result.current.current.has("Space")).toBe(true);
  });

  it("presses Space once: an auto-repeat keydown neither presses nor holds it again", () => {
    const onPress = vi.fn();
    const { result } = renderHook(() => useHeldKeys(onPress, walkingRef(true)));
    press("keydown", "Space");
    expect(onPress).toHaveBeenCalledOnce();
    result.current.current.delete("Space"); // the rig spends the press on its frame
    const repeat = press("keydown", "Space", { repeat: true });
    expect(repeat.defaultPrevented).toBe(true);
    expect(result.current.current.has("Space")).toBe(false);
    expect(onPress).toHaveBeenCalledOnce();
  });

  it("leaves a Space typed into a field alone", () => {
    const { result } = renderHook(() => useHeldKeys(vi.fn(), walkingRef(true)));
    const input = document.createElement("input");
    document.body.append(input);
    expect(press("keydown", "Space", {}, input).defaultPrevented).toBe(false);
    expect(result.current.current.size).toBe(0);
  });

  it("subscribes once, not again on every render", () => {
    const onPress = vi.fn();
    const walking = walkingRef(true);
    const add = vi.spyOn(window, "addEventListener");
    const { rerender } = renderHook(() => useHeldKeys(onPress, walking));
    add.mockClear();
    rerender();
    expect(add).not.toHaveBeenCalled();
    add.mockRestore();
  });

  it("stops listening when it unmounts", () => {
    const onPress = vi.fn();
    const { result, unmount } = renderHook(() => useHeldKeys(onPress, walkingRef(true)));
    const held = result.current.current;
    unmount();
    press("keydown", "KeyW");
    press("keydown", "Space");
    expect(held.size).toBe(0);
    expect(onPress).not.toHaveBeenCalled();
  });
});
