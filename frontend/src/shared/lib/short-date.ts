/** "31.08" for the catalog's meta line; null when there is no usable date. */
export function shortDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "4 Sep 2026" — a row whose only job is the date says which year it was.
 *
 * Spelled out rather than `toLocaleDateString("en-GB", …)`: CLDR 42 renamed the
 * short September to "Sept", so ICU prints `4 Sept 2026` on this Node and the
 * mock's string would depend on whose locale data is installed. UTC, like
 * `shortDate`, so the day does not drift west of Greenwich.
 */
export function longDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
