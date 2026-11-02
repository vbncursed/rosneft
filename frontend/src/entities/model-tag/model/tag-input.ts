// Mirrors the catalog service's checks, so a typo is caught before the round trip.
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/u;
const SLUG_MIN = 2;
const SLUG_MAX = 40;
const TITLE_MAX = 120;

export function slugError(slug: string): string | null {
  if (slug === "") return "Enter a slug.";
  if (slug.length < SLUG_MIN || slug.length > SLUG_MAX) return `Use ${SLUG_MIN} to ${SLUG_MAX} characters.`;
  return SLUG.test(slug) ? null : "Use lowercase letters, digits and single hyphens.";
}

export function titleError(title: string): string | null {
  const length = title.trim().length;
  if (length === 0) return "Enter a title.";
  return length > TITLE_MAX ? `Use at most ${TITLE_MAX} characters.` : null;
}
