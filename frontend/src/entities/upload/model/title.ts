/** Strips a trailing .zip (case-insensitive) and surrounding whitespace, for a starting title guess. */
export const deriveTitle = (fileName: string): string => fileName.replace(/\s*\.zip\s*$/iu, "").trim();

/**
 * A client-side slug guess for the form's live preview; the catalog derives
 * the real slug server-side. NFKD then dropping the combining-mark range
 * folds an accented letter to its base (ü → u) before non-alphanumerics
 * collapse to a single hyphen — without that step the diacritic itself would
 * survive as a stray hyphen and split the word (ünïcode → u-ni-code).
 */
export const slugPreview = (title: string): string =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
