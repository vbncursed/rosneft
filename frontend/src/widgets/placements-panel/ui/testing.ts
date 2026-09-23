import { vi } from "vitest";
import type { RowContext } from "./instance-item";

/** A row context with every callback a spy and every grant on; `over` replaces any field. */
export const ctx = (over: Partial<RowContext> = {}): RowContext => ({
  expanded: null,
  onToggleGroup: vi.fn(),
  selectedId: null,
  pendingIds: [],
  grants: { create: true, write: true, delete: true },
  groups: [{ id: 4, title: "East yard" }],
  visibility: null,
  onSelect: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
  onFocus: vi.fn(),
  onSetHidden: vi.fn(),
  onMoveToGroup: vi.fn(),
  ...over,
});
