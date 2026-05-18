// ConfirmRequest is the contract a caller hands to the confirm system.
// The id is assigned by the store; everything else is shaped by the
// feature asking for confirmation. `danger` swaps the confirm button to
// the destructive palette — the common case for delete dialogs.
export interface ConfirmRequest {
  id: number;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

// ConfirmInput is the caller-facing shape (no id — the store mints one).
export type ConfirmInput = Omit<ConfirmRequest, "id">;
