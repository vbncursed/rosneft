import { useEffect, useRef, useState } from "react";
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
  /**
   * The decoded equirect. Deliberately NOT a `three` Texture: a `three` import
   * in a feature is hoisted out of the lazy viewer-canvas chunk and into
   * `index`, and every other screen would then pay for it. `PanoramaSphere`
   * builds the texture from this, and owns it (and this bitmap) from then on.
   */
  bitmap: ImageBitmap | null;
  // 0–100 while downloading, null when the server sent no Content-Length
  // (bar renders indeterminate), 100 once ready.
  progress: number | null;
  status: PanoramaTextureStatus;
}

const IDLE: PanoramaTextureState = { bitmap: null, progress: null, status: "idle" };
const LOADING: PanoramaTextureState = { bitmap: null, progress: null, status: "loading" };

// State carries the hash it describes, so a capture change reads as loading
// during render. Clearing it from the effect instead would show the previous
// sphere's texture for one render, and spend a second one taking it away.
type Tracked = PanoramaTextureState & { hash: string | null };

// usePanoramaTexture streams the equirect via fetch so we can surface real
// download progress — an <img>, which TextureLoader uses, emits no bytes.
// ponytail: no in-memory cache like useLoader — re-entering a panorama
// refetches, but the asset URL is immutable (content hash) + ETag so the
// browser serves it from disk cache. Add an LRU only if that measurably hurts.
export function usePanoramaTexture(hash: string | null, decode: TextureDecoder): PanoramaTextureState {
  const [state, setState] = useState<Tracked>({ ...IDLE, hash: null });
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
        setState({ hash, bitmap, progress: 100, status: "ready" });
      } catch {
        if (!cancelled) setState({ ...IDLE, hash, status: "error" });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      // Forget what was tracked, not just the download. The state carries the
      // hash it describes, and leaving A's `ready` behind means coming back to
      // A answers `ready` with a bitmap the sphere has already closed — one
      // render of a dead texture, then loading, then ready again: a flash and
      // two camera jumps.
      setState({ ...IDLE, hash: null });
    };
  }, [hash]);

  if (state.hash !== hash) return hash ? LOADING : IDLE;
  return { bitmap: state.bitmap, progress: state.progress, status: state.status };
}
