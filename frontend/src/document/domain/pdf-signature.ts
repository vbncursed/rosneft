// A document source must be a real PDF. The browser derives File.type from the
// extension, which a renamed archive would defeat, so we sniff the leading
// bytes. Every PDF starts with the 5-byte magic "%PDF-" (0x25 50 44 46 2D).
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];

export function isPdfSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PDF_SIGNATURE.length &&
    PDF_SIGNATURE.every((byte, i) => bytes[i] === byte)
  );
}
