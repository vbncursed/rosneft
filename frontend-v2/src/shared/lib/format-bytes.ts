const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** "412 MB", "1.2 GB" — whole numbers below a gigabyte, one decimal above. */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = unit >= 3 ? value.toFixed(1).replace(/\.0$/, "") : String(Math.round(value));
  return `${text} ${UNITS[unit]}`;
}
