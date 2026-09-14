/**
 * Next selectable index in a keyboard-navigated set, skipping disabled entries.
 * Returns `from` when there is nowhere to go — a list of one, or every other
 * entry disabled.
 */
export function nextEnabled(
  length: number,
  from: number,
  direction: 1 | -1,
  isDisabled: (index: number) => boolean,
  wrap = false,
): number {
  for (let step = 1; step <= length; step += 1) {
    const raw = from + direction * step;
    if (!wrap && (raw < 0 || raw >= length)) return from;
    const index = ((raw % length) + length) % length;
    if (index === from) return from;
    if (!isDisabled(index)) return index;
  }
  return from;
}
