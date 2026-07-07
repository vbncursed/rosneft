import type {
  ConfirmInput,
  ConfirmRequest,
} from "@/shared/presentation/confirm/confirm";

// Pending is the active dialog plus the resolver that delivers the
// user's choice back to the caller. Kept private to the store.
interface Pending {
  request: ConfirmRequest;
  resolve: (decision: boolean, value: string) => void;
}

// Module-level singleton — same rationale as the toast store. One
// dialog is shown at a time; concurrent `ask` calls queue behind it.
let active: Pending | null = null;
const queue: Pending[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

function emit() {
  for (const l of listeners) l();
}

function shift() {
  active = queue.shift() ?? null;
  emit();
}

function enqueue(pending: Pending) {
  if (active) queue.push(pending);
  else {
    active = pending;
    emit();
  }
}

export function ask(input: ConfirmInput): Promise<boolean> {
  return new Promise((resolve) => {
    enqueue({ request: { ...input, id: nextId++ }, resolve: (decision) => resolve(decision) });
  });
}

// askInput resolves to the entered value on confirm, or null on cancel.
export function askInput(input: ConfirmInput): Promise<string | null> {
  return new Promise((resolve) => {
    enqueue({
      request: { ...input, id: nextId++ },
      resolve: (decision, value) => resolve(decision ? value : null),
    });
  });
}

export function resolveActive(decision: boolean, value = ""): void {
  if (!active) return;
  active.resolve(decision, value);
  shift();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): ConfirmRequest | null {
  return active?.request ?? null;
}

// Server-side rendering snapshot — always null, dialogs are
// client-only.
export function getServerSnapshot(): ConfirmRequest | null {
  return null;
}
