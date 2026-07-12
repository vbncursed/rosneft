import { useEffect, useRef, useState } from "react";
import { RepeatWrapping, SRGBColorSpace, Texture } from "three";
import { assetUrl } from "@/shared/infrastructure/asset-url";
import { readWithProgress } from "@/panorama/application/read-with-progress";

export type PanoramaTextureStatus = "idle" | "loading" | "ready" | "error";

export interface PanoramaTextureState {
  texture: Texture | null;
  // 0–100 while downloading, null when the server sent no Content-Length
  // (bar renders indeterminate), 100 once ready.
  progress: number | null;
  status: PanoramaTextureStatus;
}

// Equirect JPGs encode sRGB but three doesn't tag them, and mapped onto the
// inside of a BackSide sphere they read horizontally mirrored. Fix both: tag
// sRGB, and flip the U axis (repeat.x = -1, offset.x = 1 keeps samples in
// [0,1] while reversing direction). Mirrors the old panorama-sphere logic.
function applyEquirectFormat(texture: Texture): void {
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.repeat.x = -1;
  texture.offset.x = 1;
  texture.needsUpdate = true;
}

// usePanoramaTexture streams the equirect via fetch so we can surface real
// download progress. Returns a ready THREE.Texture plus 0–100 progress.
// ponytail: no in-memory cache like useLoader — re-entering a panorama
// refetches, but the asset URL is immutable (content hash) + ETag so the
// browser serves it from disk cache. Add an LRU only if that measurably hurts.
export function usePanoramaTexture(hash: string | null): PanoramaTextureState {
  const [state, setState] = useState<PanoramaTextureState>({
    texture: null,
    progress: null,
    status: "idle",
  });
  const textureRef = useRef<Texture | null>(null);

  useEffect(() => {
    if (!hash) {
      setState({ texture: null, progress: null, status: "idle" });
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setState({ texture: null, progress: null, status: "loading" });

    (async () => {
      try {
        const res = await fetch(assetUrl(hash), { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await readWithProgress(res, (p) => {
          if (!cancelled) setState((s) => ({ ...s, progress: p }));
        });
        // WebGL cannot apply flipY to an ImageBitmap, so a plain
        // `new Texture(bitmap)` renders the equirect upside down (unlike
        // TextureLoader's <img>, which honours the default flipY=true). Pre-flip
        // the bitmap here and set flipY=false so orientation matches.
        const bitmap = await createImageBitmap(blob, { imageOrientation: "flipY" });
        if (cancelled) {
          bitmap.close();
          return;
        }
        const texture = new Texture(bitmap);
        texture.flipY = false;
        applyEquirectFormat(texture);
        textureRef.current = texture;
        setState({ texture, progress: 100, status: "ready" });
      } catch {
        if (!cancelled) setState({ texture: null, progress: null, status: "error" });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      textureRef.current?.dispose();
      textureRef.current = null;
    };
  }, [hash]);

  return state;
}
