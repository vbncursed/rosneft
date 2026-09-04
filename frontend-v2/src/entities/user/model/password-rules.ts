// Client-side mirror of auth-service's internal/validate (password only). The
// backend stays the source of truth; change both together.

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 256;

export function validatePassword(v: string): string | null {
  const n = [...v].length;
  if (n < PASSWORD_MIN || n > PASSWORD_MAX) {
    return `Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`;
  }
  const ok =
    /\p{Lu}/u.test(v) && /\p{Ll}/u.test(v) && /\p{Nd}/u.test(v) && /[^\p{Lu}\p{Ll}\p{Nd}]/u.test(v);
  if (!ok) {
    return "Password needs an upper- and lower-case letter, a digit, and a special character";
  }
  return null;
}

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGIT = "0123456789";
const SPECIAL = "!@#$%^&*()-_=+[]{};:,.?";
const ALL = UPPER + LOWER + DIGIT + SPECIAL;

// ponytail: modulo bias is negligible for sets ≤70 over 2^32; rejection
// sampling adds code for cryptographically irrelevant gain at this scale.
const randInt = (max: number): number => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % max;
};

// generatePassword returns a 16-char password that satisfies validatePassword
// by construction: one char from each required class, the rest from the full
// pool, then Fisher–Yates shuffled so the guaranteed chars aren't front-loaded.
export function generatePassword(len = 16): string {
  const pick = (set: string) => set[randInt(set.length)];
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SPECIAL)];
  while (chars.length < len) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
