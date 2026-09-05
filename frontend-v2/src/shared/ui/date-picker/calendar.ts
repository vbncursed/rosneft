/** An ISO calendar date, "YYYY-MM-DD". No time, no zone. */
export type IsoDate = string;

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type Day = { iso: IsoDate; day: number; inMonth: boolean };

const pad = (n: number) => String(n).padStart(2, "0");

export const toIso = (year: number, month: number, day: number): IsoDate =>
  `${year}-${pad(month + 1)}-${pad(day)}`;

/**
 * Splits an ISO date into its parts. Deliberately not `new Date(iso)`: that
 * parses a bare date as UTC, so west of Greenwich it reads back a day early.
 */
export function parseIso(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  if (month < 0 || month > 11 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

/** Monday-based column of a date, 0..6 — the design's week starts on Monday. */
const mondayIndex = (year: number, month: number, day: number) =>
  (new Date(year, month, day).getDay() + 6) % 7;

/**
 * Whole weeks covering `month`, padded with the neighbouring months' days so
 * every row has seven cells. Length is 35 or 42, never a ragged grid.
 */
export function monthGrid(year: number, month: number): Day[] {
  const lead = mondayIndex(year, month, 1);
  const total = daysInMonth(year, month);
  const cells = Math.ceil((lead + total) / 7) * 7;

  return Array.from({ length: cells }, (_, i) => {
    const offset = i - lead;
    const date = new Date(year, month, offset + 1);
    return {
      iso: toIso(date.getFullYear(), date.getMonth(), date.getDate()),
      day: date.getDate(),
      inMonth: offset >= 0 && offset < total,
    };
  });
}

export function shiftMonth(year: number, month: number, by: number) {
  const date = new Date(year, month + by, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const monthLabel = (year: number, month: number) => `${MONTHS[month]} ${year}`;

/** "24 August 2026" — what a day button announces to a screen reader. */
export function dayLabel(iso: IsoDate): string {
  const parsed = parseIso(iso);
  return parsed ? `${parsed.day} ${MONTHS[parsed.month]} ${parsed.year}` : iso;
}
