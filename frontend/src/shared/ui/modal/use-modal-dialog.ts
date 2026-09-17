import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEscape } from "@/shared/lib/use-escape";

/**
 * Drives a native `<dialog>` that stays in the tree while closed.
 *
 * `close()` is what hands focus back to the element that opened the dialog,
 * and it only can while the dialog is still attached. Two paths reach it:
 * - `open` going false closes from an effect *body*. What must never close it
 *   is a layout-effect *cleanup* keyed on `open`: that runs in React's
 *   mutation phase, before React restores the focus it saw at the start of
 *   the commit — the Cancel button inside the dialog — so close() hands focus
 *   to the trigger and React takes it straight back to Cancel, which the next
 *   render then removes, dropping focus to <body> (observed; the three
 *   "focus return" specs in modal/drawer/menu go red on that shape). A
 *   useLayoutEffect body also runs after that restore and passes the same
 *   specs; the passive effect stays because it is the shape verified in
 *   Chromium (review A1);
 * - a caller unmounting the dialog closes from a layout cleanup, which React
 *   runs before it removes the node.
 * `shown` keeps the body mounted until the exit transition in `theme.css`
 * has played, then drops it, so a reopened dialog starts fresh.
 */
export function useModalDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);

  useEscape(open, onClose);

  // Before paint, so the first frame is the transition's starting style.
  useLayoutEffect(() => {
    const el = ref.current;
    if (open && el && !el.open) el.showModal();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (open || !el?.open) return;
    el.close();
    // jsdom has no getAnimations; nothing runs there either.
    const running = el.getAnimations?.() ?? [];
    if (running.length === 0) return setShown(false);
    // A reopen cancels the exit transition and rejects `finished`: the body
    // must then stay.
    Promise.all(running.map((a) => a.finished)).then(
      () => setShown(false),
      () => {},
    );
  }, [open]);

  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      if (el?.open) el.close();
    };
  }, []);

  return { ref, shown };
}
