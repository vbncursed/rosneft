import { useSyncExternalStore } from "react";
import type { ToastTone } from "@/shared/ui/toast";

export type Notice = { id: number; tone: ToastTone; message: string };

// Long enough to read a short sentence, short enough that a burst of them
// never lingers.
const AUTO_DISMISS_MS = 5000;

// Module-level on purpose: a mutation deep in a container hook reports
// through here without threading a context down, and the host is one
// component near the root.
let notices: readonly Notice[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

const emit = () => listeners.forEach((listen) => listen());

function push(tone: ToastTone, message: string): number {
  const id = nextId++;
  // Newest first, so the host draws it on top.
  notices = [{ id, tone, message }, ...notices];
  emit();
  setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  return id;
}

export function dismiss(id: number): void {
  const next = notices.filter((n) => n.id !== id);
  if (next.length === notices.length) return;
  notices = next;
  emit();
}

/** Test seam: a spec that pushed notices must not leak them into the next. */
export function clearNotices(): void {
  notices = [];
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// `notices` is replaced, never mutated, so the same reference means "unchanged"
// — what useSyncExternalStore needs from a snapshot.
const getSnapshot = () => notices;

export function useNotices(): readonly Notice[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const notify = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
  warning: (message: string) => push("warning", message),
};
