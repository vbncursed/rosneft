import { useSyncExternalStore } from "react";
import type { ToastTone } from "@/shared/ui/toast";

/** The one thing a reader can do about a failure from the card itself. */
export type NoticeAction = { label: string; run: () => void };

export type Notice = { id: number; tone: ToastTone; message: string; action?: NoticeAction };

// Module-level on purpose: a mutation deep in a container hook reports
// through here without threading a context down, and the host is one
// component near the root.
let notices: readonly Notice[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

const emit = () => listeners.forEach((listen) => listen());

// How long a card stays is the Toast's own (shared/ui/toast): success and info
// leave after 4 s, error and warning wait for the reader.
function push(tone: ToastTone, message: string, action?: NoticeAction): number {
  // The same failure twice is one card: a repeated click must not build a wall.
  // Only a card that waits for the reader folds — a confirmation goes by itself
  // and a repeat is its own event — and never one with an action: each Retry
  // closes over its own attempt.
  const waits = tone === "error" || tone === "warning";
  const same = waits && !action && notices.find((n) => n.tone === tone && n.message === message && !n.action);
  if (same) return same.id;
  const id = nextId++;
  // Oldest first: ToastStack draws the newest on top.
  notices = [...notices, { id, tone, message, ...(action ? { action } : {}) }];
  emit();
  return id;
}

export function dismiss(id: number): void {
  const next = notices.filter((n) => n.id !== id);
  if (next.length === notices.length) return;
  notices = next;
  emit();
}

/**
 * Test seam: a spec that pushed notices must not leak them into the next.
 * Deliberately no emit — specs call this from afterEach, which vitest runs
 * before the setup file's RTL cleanup, so a reader is still mounted and an
 * emit here is a React update outside act.
 */
export function clearNotices(): void {
  notices = [];
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
  error: (message: string, action?: NoticeAction) => push("error", message, action),
  info: (message: string) => push("info", message),
  warning: (message: string) => push("warning", message),
};
