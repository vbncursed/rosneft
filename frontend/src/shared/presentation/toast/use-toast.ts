import { push } from "@/shared/presentation/toast/toast-store";
import type { ToastKind } from "@/shared/presentation/toast/toast";

// notify is a tiny stable facade. Callers don't need a React context —
// the store is a module-level singleton, so this is safe from any
// component, hook, or event handler.
export const notify = {
  error: (msg: string) => push("error", msg),
  warning: (msg: string) => push("warning", msg),
  info: (msg: string) => push("info", msg),
  success: (msg: string) => push("success", msg),
  show: (kind: ToastKind, msg: string) => push(kind, msg),
};
