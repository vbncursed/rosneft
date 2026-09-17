import type { TextureDecoder } from "@/features/panorama-view";

// WebGL cannot flipY an ImageBitmap; pre-flipping here and `flipY = false` on
// the texture is what keeps the equirect upright. jsdom has no
// createImageBitmap: exempt, and the hook that uses it takes it as a parameter.
export const decodeImageBitmap: TextureDecoder = (blob) =>
  createImageBitmap(blob, { imageOrientation: "flipY" });
