/** The mock's page: six rows. */
export const PAGE_SIZE = 6;

/**
 * Never fewer than one — an empty feed is one empty page, and the section
 * draws its empty state instead of a pager over nothing.
 */
export const pageCount = (total: number): number => Math.max(1, Math.ceil(total / PAGE_SIZE));

/** The page's rows out of what is loaded so far; a short last page included. */
export const pageSlice = <T>(rows: T[], page: number): T[] =>
  rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

/**
 * "1–6 of 184 events" — the mock's line, en dash and all. The range form
 * always, so a single event prints "1–1 of 1 events": the formula, not a
 * special case.
 */
export const pageSummary = (page: number, total: number): string =>
  `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} events`;

/** How many rows must be loaded before `page` can be shown in full. */
export const rowsNeeded = (page: number): number => page * PAGE_SIZE;
