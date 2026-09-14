import { useEffect, useRef, useState } from "react";
import { RepeatWrapping, SRGBColorSpace, Texture } from "three";
import { readWithProgress } from "@/entities/panorama";
import { assetUrl } from "@/entities/content";

export type PanoramaTextureStatus = "idle" | "loading" | "ready" | "error";

/**
 * Turns the downloaded bytes into a bitmap. Injected because the one call that
 * does it — `createImageBitmap` with `imageOrientation` — is the one line jsdom
 * cannot run; the widget that owns the canvas supplies the real one.
 */
export type TextureDecoder = (blob: Blob) => Promise<ImageBitmap>;

export interface PanoramaTextureState {
  texture: Texture | null;
  // 0–100 while downloading, null when the server sent no Content-Length
  // (bar renders indeterminate), 100 once ready.
  progress: number | null;
  status: PanoramaTextureStatus;
}

const IDLE: PanoramaTextureState = { texture: null, progress: null, status: "idle" };
const LOADING: PanoramaTextureState = { texture: null, progress: null, status: "loading" };

// State carries the hash it describes, so a capture change reads as loading
// during render. Clearing it from the effect instead would show the previous
// sphere's texture for one render, and spend a second one taking it away.
type Tracked = PanoramaTextureState & { hash: string | null };

// Equirect JPGs encode sRGB but three doesn't tag them, and mapped onto the
// inside of a BackSide sphere they read horizontally mirrored. Fix both: tag
// sRGB, and flip the U axis (repeat.x = -1, offset.x = 1 keeps samples in
// [0,1] while reversing direction).
function applyEquirectFormat(texture: Texture): void {
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.repeat.x = -1;
  texture.offset.x = 1;
  texture.needsUpdate = true;
}

// usePanoramaTexture streams the equirect via fetch so we can surface real
// download progress — an <img>, which TextureLoader uses, emits no bytes.
// ponytail: no in-memory cache like useLoader — re-entering a panorama
// refetches, but the asset URL is immutable (content hash) + ETag so the
// browser serves it from disk cache. Add an LRU only if that measurably hurts.
export function usePanoramaTexture(hash: string | null, decode: TextureDecoder): PanoramaTextureState {
  const [state, setState] = useState<Tracked>({ ...IDLE, hash: null });
  const textureRef = useRef<Texture | null>(null);
  // The decoder is read through a ref rather than a dependency: a caller who
  // spells it inline hands us a new function every render, and a decoder in
  // the dep list would restart the download on each one — forever.
  const decodeRef = useRef(decode);
  useEffect(() => {
    decodeRef.current = decode;
  });

  useEffect(() => {
    if (!hash) return;
    let cancelled = false;
    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch(assetUrl(hash), { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await readWithProgress(res, (progress) => {
          if (!cancelled) setState({ ...LOADING, hash, progress });
        });
        const bitmap = await decodeRef.current(blob);
        if (cancelled) {
          // Nothing holds it, and an ImageBitmap is not garbage-collected bytes.
          bitmap.close();
          return;
        }
        const texture = new Texture(bitmap);
        // The bitmap arrives pre-flipped: WebGL cannot apply flipY to one, so a
        // plain `new Texture(bitmap)` would render the equirect upside down.
        texture.flipY = false;
        applyEquirectFormat(texture);
        textureRef.current = texture;
        setState({ hash, texture, progress: 100, status: "ready" });
      } catch {
        if (!cancelled) setState({ ...IDLE, hash, status: "error" });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      textureRef.current?.dispose();
      textureRef.current = null;
    };
  }, [hash]);

  if (state.hash !== hash) return hash ? LOADING : IDLE;
  return { texture: state.texture, progress: state.progress, status: state.status };
}
