import { useEffect, useRef, useState } from "react";
import { assetUrl } from "@/entities/content";
import type { LodArtifact } from "@/entities/scene";

/** A finished level's blob, kept past the level change. */
type HeldBlob = { hash: string; blobUrl: string };

export type LodDownload = {
  blobUrl: string | null;
  received: number;
  failed: { status: number | null } | null;
  /** The level before this one, if its download finished: it may still be on screen. */
  held: HeldBlob | null;
};

type Progress = Omit<LodDownload, "held">;

const IDLE: Progress = { blobUrl: null, received: 0, failed: null };

// State carries the hash it describes so a level change reads as idle during
// render. Resetting it from the effect instead would leave the previous
// level's percent on screen for one render, and start a second one to clear it.
type Tracked = Progress & { hash: string | null };

/**
 * Fetches one level with a streamed body so the page can draw real progress —
 * drei's loader exposes none. The blob URL is what useGLTF then parses (and
 * caches by), so the bytes travel once. On a level change a finished blob
 * becomes `held` rather than revoked — it is what stays on screen while a
 * finer level downloads. A return to the held level adopts that blob instead
 * of fetching the level again, so no level is ever alive twice. `held` is
 * released once `drawn` (the url whose mesh is on screen) is this level's own
 * blob — nothing can show the one before it any more — and revoked when the
 * next one replaces it or the caller unmounts. The caller evicts drei's parsed copy of
 * every blob that stops being current or held.
 *
 * ponytail: one setState per chunk — a few hundred renders on a 10 MB file,
 * and only the progress chip re-renders. Throttle to one update per 100 ms if
 * a profile ever says it matters.
 */
export function useLodDownload(artifact: LodArtifact | null, drawn: string | null = null): LodDownload {
  const [state, setState] = useState<Tracked>({ ...IDLE, hash: null });
  const [held, setHeld] = useState<HeldBlob | null>(null);
  // The same value as `held`, readable from a cleanup without a stale closure.
  const heldRef = useRef<HeldBlob | null>(null);
  const hash = artifact?.hash ?? null;
  const size = artifact?.size ?? 0;

  useEffect(() => {
    if (!hash) return;
    const controller = new AbortController();
    let url: string | null = null;
    // The level is the held one: its blob is finished and drei has parsed it.
    // Taken over as this level's own `url`, so the cleanup below hands it back
    // to `held` on the next change, as it would a blob it had downloaded.
    if (heldRef.current?.hash === hash) {
      url = heldRef.current.blobUrl;
      heldRef.current = null;
      setHeld(null);
      setState({ hash, blobUrl: url, received: size, failed: null });
    } else void (async () => {
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
      if (url) {
        if (heldRef.current) URL.revokeObjectURL(heldRef.current.blobUrl);
        heldRef.current = { hash, blobUrl: url };
        setHeld(heldRef.current);
      }
      // Leaving the level forgets its progress: a return adopts the held blob
      // or starts from 0, never from this level's stale percent.
      setState((st) => (st.hash === hash ? { ...IDLE, hash: null } : st));
    };
  }, [hash, size]);

  const live = state.hash === hash ? state : IDLE;
  // This level's own blob is drawn: nothing can show the held one any more.
  const onScreen = live.blobUrl !== null && drawn === live.blobUrl;
  useEffect(() => {
    if (!onScreen || !heldRef.current) return;
    URL.revokeObjectURL(heldRef.current.blobUrl);
    heldRef.current = null;
    setHeld(null);
  }, [onScreen]);

  // Declared after the download so its cleanup runs after that one on
  // unmount, and so also revokes the blob that cleanup has just handed over.
  useEffect(
    () => () => {
      if (heldRef.current) URL.revokeObjectURL(heldRef.current.blobUrl);
      heldRef.current = null;
    },
    [],
  );

  // On the render a level changes, the cleanup that moves the finished blob
  // into `held` has not run yet; read as `held` already, or the level on
  // screen would lose its url for that render and remount off the asset route.
  const leaving = state.hash !== hash && state.hash !== null && state.blobUrl
    ? { hash: state.hash, blobUrl: state.blobUrl }
    : null;
  return { blobUrl: live.blobUrl, received: live.received, failed: live.failed, held: leaving ?? held };
}
