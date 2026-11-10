/** Converts WebGL's bottom-up RGBA buffer to top-down grayscale. */
export function grayscaleReadback(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = ((height - 1 - y) * width + x) * 4;
      result[y * width + x] = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
    }
  return result;
}
