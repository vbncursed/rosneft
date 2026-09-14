import { httpHead } from "@/shared/api";

export const assetUrl = (hash: string) => `/api/assets/${encodeURIComponent(hash)}`;

/**
 * A blob's byte size without its bytes, or null: the API carries no source
 * size, and a size line that cannot be read prints "—" rather than failing
 * the page.
 */
export async function assetSize(hash: string): Promise<number | null> {
  try {
    const length = (await httpHead(assetUrl(hash))).get("Content-Length");
    const n = length === null ? NaN : Number(length);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
