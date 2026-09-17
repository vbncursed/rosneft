/**
 * Gates the href sink to http(s). The URL is operator supplied, and rendering
 * it into an `<a href>` would otherwise let a `javascript:` (or `data:`) value
 * execute on click — an XSS vector `rel="noopener"` does not cover. A
 * non-http(s) value draws no link at all.
 */
export function isSafeHttpUrl(raw: string): boolean {
  try {
    const { protocol } = new URL(raw);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}
