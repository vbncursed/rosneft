// DropdownOption is the canonical shape consumed by <Dropdown>. value is
// always a string so the component stays primitive-agnostic — callers
// stringify their domain ids on the way in and parse on the way out.
export interface DropdownOption {
  value: string;
  label: string;
  // Disabled options are skipped by keyboard navigation and rendered
  // dimmer. Selecting them via mouse is a no-op.
  disabled?: boolean;
  // Optional inline hint shown to the right of the label (e.g. unit,
  // status). Kept short — long hints get truncated.
  hint?: string;
  // Header rows are non-interactive section labels (no bullet, no hover,
  // skipped by keyboard nav, role="presentation"). Use to group options.
  header?: boolean;
}

// Selectable = a real choice a user can land on. Headers and disabled
// rows are skipped by keyboard nav and ignored on click.
export function isSelectable(o: DropdownOption): boolean {
  return !o.disabled && !o.header;
}
