// A panorama source must be an equirectangular raster the browser can
// decode as a texture. The viewer crashes if a non-image blob (e.g. a
// ZIP archive picked by mistake) is stored as a panorama, so we sniff the
// file's leading bytes rather than trusting its declared MIME type — the
// browser derives `File.type` from the extension, which a renamed archive
// would defeat.
//
// JPEG: FF D8 FF. PNG: 89 50 4E 47 0D 0A 1A 0A.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function isEquirectImageSignature(bytes: Uint8Array): boolean {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return true;
  }
  return (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)
  );
}
