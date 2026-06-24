// Client-side mirror of the auth-service validate package. The backend stays
// the source of truth; these give instant feedback only.

const USERNAME_MIN = 3;
const USERNAME_MAX = 50;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 256;
const EMAIL_MAX = 254;

export function validateUsername(v: string): string | null {
  const n = [...v].length;
  if (n < USERNAME_MIN || n > USERNAME_MAX) {
    return `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters`;
  }
  return null;
}

export function validateEmail(v: string): string | null {
  if (v.length > EMAIL_MAX) return "Email is too long";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email";
  return null;
}

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
