// ConfirmRequest is the contract a caller hands to the confirm system.
// The id is assigned by the store; everything else is shaped by the
// feature asking for confirmation. `danger` swaps the confirm button to
// the destructive palette — the common case for delete dialogs.
// ConfirmField, when present, turns the dialog into a prompt: it renders a
// single native input and the caller receives the entered value instead of a
// bare boolean. `password` masks the input; `code` and `text` are plain text.
export interface ConfirmField {
  type: "text" | "password" | "code";
  placeholder?: string;
}

export interface ConfirmRequest {
  id: number;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  field?: ConfirmField;
}

// ConfirmInput is the caller-facing shape (no id — the store mints one).
export type ConfirmInput = Omit<ConfirmRequest, "id">;
