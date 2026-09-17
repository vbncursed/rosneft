const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/**
 * The 24-hour window's lower bound, rounded down to the running hour: a bound
 * that moved with the clock would mint a new query key on every render, and a
 * bound captured once would drift on a tab left open all day. It advances to
 * the next hour on the next render — nothing re-renders an idle tab, and a
 * paged tab that sits still keeps its hour, which is accepted.
 */
export const windowStart = (now = new Date()): string =>
  new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS - DAY_MS).toISOString();

/** The start of strip bucket `i` (0 = 23 hours ago, 23 = the hour still running). */
export const hourOf = (now: Date, i: number): Date => new Date(now.getTime() - (23 - i) * HOUR_MS);

/** Index of the strip bucket an entry falls in, or -1 outside the 24 drawn. */
export const bucketOf = (at: string, now: Date): number => {
  const startOf = (d: Date) => Math.floor(d.getTime() / HOUR_MS);
  const i = startOf(new Date(at)) - startOf(hourOf(now, 0));
  return i >= 0 && i < 24 ? i : -1;
};
