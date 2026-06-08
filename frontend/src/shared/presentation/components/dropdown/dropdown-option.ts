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
}
