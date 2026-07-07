// ConfirmRequest is the contract a caller hands to the confirm system.
// The id is assigned by the store; everything else is shaped by the
// feature asking for confirmation. `danger` swaps the confirm button to
// the destructive palette — the common case for delete dialogs.
// ConfirmField, when present, turns the dialog into a prompt: it renders a
// single input and the caller receives the entered value instead of a bare
// boolean. `password` masks the input; `text` is plain text; `code` renders a
// 6-digit segmented input that auto-submits when full. When `altLabel` is set
// (code only), a toggle swaps to a plain text field for an alternate value
// (e.g. a recovery code) — the caller owns the wording; the modal stays
// feature-agnostic.
export interface ConfirmField {
  type: "text" | "password" | "code";
  placeholder?: string;
  altLabel?: string;
  altPlaceholder?: string;
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
