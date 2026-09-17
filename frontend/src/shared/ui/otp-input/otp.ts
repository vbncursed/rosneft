/** Keeps only digits and never lets the code grow past `length`. */
export function sanitize(raw: string, length: number): string {
  return raw.replace(/\D/g, "").slice(0, length);
}

/**
 * Writes one digit at `index`, padding any gap the caret jumped over so the
 * string stays positional — "4" with a digit at index 2 becomes "4 2", not "42".
 */
export function setDigitAt(value: string, index: number, digit: string, length: number): string {
  if (index < 0 || index >= length) return value;
  const chars = value.padEnd(length, " ").split("");
  chars[index] = digit === "" ? " " : digit;
  return chars.join("").trimEnd();
}

/** Clears the cell at `index`, trimming trailing blanks back off the code. */
export function clearDigitAt(value: string, index: number, length: number): string {
  return setDigitAt(value, index, "", length);
}

export const isComplete = (value: string, length: number) =>
  value.length === length && !value.includes(" ");
