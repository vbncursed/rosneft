export type FilterChip = {
  /** The whole token as typed, e.g. "entity:territory". */
  token: string;
  key: string;
  value: string;
};

/**
 * Reads `key:value` tokens out of a filter query. Anything without a colon is
 * free text — the reader is still typing, or searching by name — and gets no
 * chip, so half-typed input does not flicker one into existence.
 */
export function parseFilters(query: string): FilterChip[] {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => {
      const colon = token.indexOf(":");
      if (colon <= 0 || colon === token.length - 1) return [];
      return [{ token, key: token.slice(0, colon), value: token.slice(colon + 1) }];
    });
}

/** Removes one token, leaving the rest of the query as it was. */
export function removeToken(query: string, token: string): string {
  return query
    .split(/\s+/)
    .filter((part) => part && part !== token)
    .join(" ");
}

/**
 * The free-text part — everything that is not a `key:value` token. Defers to
 * `parseFilters` for what counts as one: when the two disagreed, a value with
 * a colon in it ("grants:users:write") was filtered on *and* searched for as
 * text, so nothing could match it.
 */
export function freeText(query: string): string {
  const tokens = new Set(parseFilters(query).map((filter) => filter.token));
  return query
    .split(/\s+/)
    .filter((part) => part && !tokens.has(part))
    .join(" ");
}
