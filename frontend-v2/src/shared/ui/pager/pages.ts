/** A page chip, or the "…" between two chips that are not neighbours. */
export type PageItem = number | "gap";

/**
 * Which pages a pager draws: the first, the last two, and the current page
 * with its neighbours — the mock's rule — with one gap wherever two kept pages
 * are not adjacent. `pageList(5, 31)` → `1 … 4 5 6 … 30 31`.
 */
export function pageList(page: number, count: number): PageItem[] {
  const current = Math.min(Math.max(page, 1), Math.max(count, 1));
  const keep = new Set([1, count - 1, count, current - 1, current, current + 1]);
  const out: PageItem[] = [];
  for (let i = 1; i <= count; i += 1) {
    if (!keep.has(i)) continue;
    const last = out[out.length - 1];
    if (typeof last === "number" && i - last > 1) out.push("gap");
    out.push(i);
  }
  return out;
}
