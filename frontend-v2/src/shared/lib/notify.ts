import { useSyncExternalStore } from "react";
import type { ToastTone } from "@/shared/ui/toast";

export type Notice = { id: number; tone: ToastTone; message: string };

// A confirmation goes by itself; a failure waits for the reader, who may have
// looked away for the second it was on screen.
const LIFETIME: Record<ToastTone, number | null> = {
  success: 4000,
  info: 4000,
  error: null,
  warning: null,
};

/** Why the countdowns are stopped: the pointer is on a card, or the tab is hidden. */
export type NoticeHold = "hover" | "hidden";

type Countdown = {
  remaining: number;
  startedAt: number | null;
  timer?: ReturnType<typeof setTimeout>;
};

// Module-level on purpose: a mutation deep in a container hook reports
// through here without threading a context down, and the host is one
// component near the root.
let notices: readonly Notice[] = [];
const listeners = new Set<() => void>();
let nextId = 1;
const countdowns = new Map<number, Countdown>();
const holds = new Set<NoticeHold>();

function run(id: number, c: Countdown): void {
  c.startedAt = Date.now();
  c.timer = setTimeout(() => dismiss(id), c.remaining);
}

function stop(c: Countdown): void {
  if (c.startedAt === null) return;
  clearTimeout(c.timer);
  c.remaining -= Date.now() - c.startedAt;
  c.startedAt = null;
}

export function holdNotices(reason: NoticeHold): void {
  holds.add(reason);
  countdowns.forEach(stop);
}

export function releaseNotices(reason: NoticeHold): void {
  if (!holds.delete(reason) || holds.size > 0) return;
  countdowns.forEach((c, id) => run(id, c));
}

const emit = () => listeners.forEach((listen) => listen());

function push(tone: ToastTone, message: string): number {
  const id = nextId++;
  // Newest first, so the host draws it on top.
  notices = [{ id, tone, message }, ...notices];
  emit();
  const lifetime = LIFETIME[tone];
  if (lifetime !== null) {
    const c: Countdown = { remaining: lifetime, startedAt: null };
    countdowns.set(id, c);
    if (holds.size === 0) run(id, c);
  }
  return id;
}

export function dismiss(id: number): void {
  const c = countdowns.get(id);
  if (c) clearTimeout(c.timer);
  countdowns.delete(id);
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
  countdowns.forEach((c) => clearTimeout(c.timer));
  countdowns.clear();
  holds.clear();
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
