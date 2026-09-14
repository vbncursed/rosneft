// readWithProgress drains a fetch Response body, reporting download progress
// as it goes. TextureLoader/useLoader load images through an <img> element,
// which emits no byte progress — streaming the body ourselves is the only way
// to surface a real percentage. Progress is 0–100 when Content-Length is
// known, or a single null (indeterminate) when the server didn't send it.
export async function readWithProgress(
  res: Response,
  onProgress: (p: number | null) => void,
): Promise<Blob> {
  // Read Content-Length before getReader() — getReader() locks the body, so
  // the res.blob() fallback below would throw "Body already read" if we
  // grabbed the reader unconditionally.
  const total = Number(res.headers.get("Content-Length"));
  const reader = total ? res.body?.getReader() : undefined;
  if (!reader) {
    onProgress(null);
    return res.blob();
  }

  const chunks: BlobPart[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    // Cap at 100: a compressed transfer can stream more decoded bytes than
    // the wire Content-Length, which would otherwise push past 100.
    onProgress(Math.min(100, Math.round((loaded / total) * 100)));
  }
  return new Blob(chunks);
}
