// formatDistance picks 1–3 significant decimals depending on magnitude —
// a 0.005-unit measurement and a 1500-unit measurement should both read
// well. When unitRatio is exactly 1 (metadata-less fallback) the value
// is suffixed with "u" to make clear these are scene units, not real ones.
export function formatDistance(value: number, unitRatio: number): string {
  const abs = Math.abs(value);
  let formatted: string;
  if (abs >= 100) formatted = value.toFixed(1);
  else if (abs >= 1) formatted = value.toFixed(2);
  else formatted = value.toFixed(3);
  return unitRatio === 1 ? `${formatted} u` : formatted;
}
