import { ask, askInput } from "@/shared/presentation/confirm/confirm-store";
import type { ConfirmInput } from "@/shared/presentation/confirm/confirm";

// confirmAction is the public facade. Returns true when the user
// accepts, false otherwise. Safe to call from event handlers or async
// flows — no React context required.
export function confirmAction(input: ConfirmInput): Promise<boolean> {
  return ask(input);
}

// confirmWithInput opens a prompt dialog with a single field and resolves to the
// entered value, or null if cancelled. Pass `field` to shape the input.
export function confirmWithInput(input: ConfirmInput): Promise<string | null> {
  return askInput(input);
}
