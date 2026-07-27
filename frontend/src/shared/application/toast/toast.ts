// Toast is one entry in the global notification stack. The id is
// monotonic so the renderer can key off it and the store can find
// entries for dismissal. Kind drives colour + icon. Message is shown
// verbatim — callers format their own copy before pushing.
export type ToastKind = "error" | "warning" | "info" | "success";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}
