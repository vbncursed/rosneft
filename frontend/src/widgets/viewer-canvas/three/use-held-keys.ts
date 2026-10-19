import { useEffect, useRef, type RefObject } from "react";
import { isShortcutBlocked } from "@/features/viewer-mode";
import { isMoveKey, JUMP_KEY } from "../model/free-cam";

/**
 * The free cam's held keys, by `event.code` — the same physical keys on a
 * Russian layout. `onPress` runs on each press taken (the rig re-reads its
 * pose and asks for a frame). Space is taken only while `canJump()` — walking —
 * and is one press however long it is held: the auto-repeat keydowns after the
 * first do not count. Taken, it is kept from the page on the way down and up:
 * no scroll, and no click on a button that holds the focus. Otherwise Space is
 * not touched at all.
 */
export function useHeldKeys(onPress: () => void, canJump: () => boolean): RefObject<Set<string>> {
  const keys = useRef(new Set<string>());

  useEffect(() => {
    const held = keys.current;
    const isJump = (e: KeyboardEvent) => e.code === JUMP_KEY && canJump() && !isShortcutBlocked(e);
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
    // A release always counts, wherever focus went in between.
    const up = (e: KeyboardEvent) => {
      if (isJump(e)) e.preventDefault();
      held.delete(e.code);
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
  }, [onPress, canJump]);

  return keys;
}
