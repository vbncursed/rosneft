import { useEffect, useState } from "react";
import { assetUrl } from "@/entities/content";
import type { LodArtifact } from "@/entities/scene";

export type LodDownload = {
  blobUrl: string | null;
  received: number;
  failed: { status: number | null } | null;
};

const IDLE: LodDownload = { blobUrl: null, received: 0, failed: null };

// State carries the hash it describes so a level change reads as idle during
// render. Resetting it from the effect instead would leave the previous
// level's percent on screen for one render, and start a second one to clear it.
type Tracked = LodDownload & { hash: string | null };

/**
 * Fetches one level with a streamed body so the page can draw real progress —
 * drei's loader exposes none. The blob URL is what useGLTF then parses (and
 * caches by), so the bytes travel once. Revoked when the level changes or the
 * caller unmounts; drei's parsed cache survives the revoke.
 *
 * ponytail: one setState per chunk — a few hundred renders on a 10 MB file,
 * and only the progress chip re-renders. Throttle to one update per 100 ms if
 * a profile ever says it matters.
 */
export function useLodDownload(artifact: LodArtifact | null): LodDownload {
  const [state, setState] = useState<Tracked>({ ...IDLE, hash: null });
  const hash = artifact?.hash ?? null;

  useEffect(() => {
    if (!hash) return;
    const controller = new AbortController();
    let url: string | null = null;
    void (async () => {
      try {
        const res = await fetch(assetUrl(hash), {
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!res.ok || !res.body) {
          setState({ ...IDLE, hash, failed: { status: res.status } });
          return;
        }
        const reader = res.body.getReader();
        const chunks: BlobPart[] = [];
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          // A fetch chunk is always ArrayBuffer-backed; its type says
          // ArrayBufferLike, which also admits SharedArrayBuffer and so is not
          // a BlobPart.
          chunks.push(value as BlobPart);
          received += value.byteLength;
          setState({ hash, blobUrl: null, received, failed: null });
        }
        url = URL.createObjectURL(new Blob(chunks, { type: "model/gltf-binary" }));
        // The cleanup can fire between the last read() and this line, and it
        // sees `url` still null — so nothing but this branch would ever revoke
        // the blob it just minted.
        if (controller.signal.aborted) {
          URL.revokeObjectURL(url);
          return;
        }
        setState({ hash, blobUrl: url, received, failed: null });
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          setState({ ...IDLE, hash, failed: { status: null } });
        }
      }
    })();
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
      // Leaving the level forgets it: a return starts from 0, not from a
      // finished download whose blob was just revoked.
      setState((st) => (st.hash === hash ? { ...IDLE, hash: null } : st));
    };
  }, [hash]);

  const live = state.hash === hash ? state : IDLE;
  return { blobUrl: live.blobUrl, received: live.received, failed: live.failed };
}
