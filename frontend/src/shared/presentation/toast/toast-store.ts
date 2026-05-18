import type { Toast, ToastKind } from "@/shared/presentation/toast/toast";

// AUTO_DISMISS_MS is the time after which a toast removes itself. Five
// seconds matches the prompt — long enough to read a short error
// message, short enough that stacked notifications never linger.
const AUTO_DISMISS_MS = 5000;

// Module-level singleton. The toast layer is global so a Context would
// add boilerplate without buying anything. Listeners are stored in a
// Set so subscribe/unsubscribe are O(1).
let toasts: readonly Toast[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function emit() {
  for (const l of listeners) l();
}

export function push(kind: ToastKind, message: string): number {
  const id = nextId++;
  // New entries land at index 0 so the Toaster renders them above
  // the older ones — the prompt asks for newest-on-top.
  toasts = [{ id, kind, message }, ...toasts];
  emit();
  setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  return id;
}

export function dismiss(id: number): void {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

// useSyncExternalStore consumes these. getSnapshot must return the
// SAME reference between calls when nothing changed — we mutate the
// `toasts` reference (new array on every push/dismiss) so this is
// already satisfied.
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): readonly Toast[] {
  return toasts;
}

// Server-side rendering hands back an empty stack; toasts only matter
// once the client mounts.
export function getServerSnapshot(): readonly Toast[] {
  return EMPTY;
}
const EMPTY: readonly Toast[] = [];
