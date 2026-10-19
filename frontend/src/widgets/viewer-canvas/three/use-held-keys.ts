import { useEffect, useRef, type RefObject } from "react";
import { isShortcutBlocked } from "@/features/viewer-mode";
import { isMoveKey, JUMP_KEY } from "../model/free-cam";

/**
 * The free cam's held keys, by `event.code` — the same physical keys on a
 * Russian layout. `onPress` runs on each press taken (the rig re-reads its
 * pose and asks for a frame). Space is taken only while `walking.current` is
 * set — walking — and is one press however long it is held: the auto-repeat
 * keydowns after the first do not count. Its release does not clear it either:
 * a Space pressed and let go before the next frame still jumps, because the
 * rig spends it on that frame. Taken, it is kept from the page on the way down
 * and up: no scroll, and no click on a button that holds the focus. Otherwise
 * Space is not touched at all.
 *
 * `walking` and `onPress` must be stable: the listeners subscribe once.
 */
export function useHeldKeys(onPress: () => void, walking: RefObject<unknown>): RefObject<Set<string>> {
  const keys = useRef(new Set<string>());

  useEffect(() => {
    const held = keys.current;
    const isJump = (e: KeyboardEvent) => e.code === JUMP_KEY && walking.current !== null && !isShortcutBlocked(e);
    const down = (e: KeyboardEvent) => {
      // macOS sends no keyup for the other keys while ⌘ is down: drop them before the guard below.
      if (e.key === "Meta" || e.metaKey) {
        held.clear();
        return;
      }
      if (isJump(e)) {
        e.preventDefault();
        if (e.repeat) return;
      } else if (!isMoveKey(e.code) || isShortcutBlocked(e)) {
        return;
      }
      held.add(e.code);
      onPress();
    };
    // A release always counts, wherever focus went in between. Space is the exception:
    // it is a latch the rig clears on its frame, not a key held down.
    const up = (e: KeyboardEvent) => {
      if (isJump(e)) e.preventDefault();
      if (e.code !== JUMP_KEY) held.delete(e.code);
    };
    // Alt-Tab swallows the keyup: a key held across it would move on for ever.
    const blur = () => held.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [onPress, walking]);

  return keys;
}
