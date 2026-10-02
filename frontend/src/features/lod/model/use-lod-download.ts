import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { assetUrl } from "@/entities/content";
import type { LodArtifact } from "@/entities/scene";

/** A finished level's blob, kept past the level change. */
type HeldBlob = { hash: string; blobUrl: string };

export type LodDownload = {
  blobUrl: string | null;
  received: number;
  failed: { status: number | null } | null;
  /** A finished level other than this one, kept past a level change: it may still be on screen. */
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
 * finer level downloads. A return to the held level while it is still held
 * adopts that blob instead of fetching the level again, so no level is ever
 * alive twice; it reads as adopted (the blob, the level's full size) from the
 * first render of the return, never as an idle 0 %. `held` is kept only while
 * it can still be on screen: it is released once `drawn` (the url whose mesh
 * is on screen) is anything else — this level's own blob, or the coarsest
 * level's asset route — and a later return downloads the level again. It is
 * also revoked when the next finished level replaces it or the caller
 * unmounts. The one exception to "replaces": the blob that is drawn is never
 * revoked. Leaving a finished level while the held one is drawn keeps the
 * held one and revokes the level being left. The caller
 * evicts drei's parsed copy of every blob that stops being current or held.
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
  // `drawn` for the download's cleanup, which runs in the commit of the render
  // that changed the level. A layout effect lands before that cleanup; a
  // passive one would not, and the cleanup would read the commit before.
  const drawnRef = useRef(drawn);
  useLayoutEffect(() => {
    drawnRef.current = drawn;
  });
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
    } else
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
      // One finished blob is kept past the change, and never the other one
      // while it is drawn: the held level may still be on screen (a finer
      // download not yet drawn), and a return to it adopts it.
      const prev = heldRef.current;
      if (url && prev && drawnRef.current === prev.blobUrl) URL.revokeObjectURL(url);
      else if (url) {
        if (prev) URL.revokeObjectURL(prev.blobUrl);
        heldRef.current = { hash, blobUrl: url };
        setHeld(heldRef.current);
      }
      // Leaving the level forgets its progress: a return adopts the held blob
      // or starts from 0, never from this level's stale percent.
      setState((st) => (st.hash === hash ? { ...IDLE, hash: null } : st));
    };
  }, [hash, size]);

  // On the render a level changes, the cleanup that decides which finished
  // blob is kept has not run yet; read its outcome already. The level being
  // left is kept unless the held one is drawn. Without this the level on
  // screen would lose its url for that render and remount off the asset route.
  const heldDrawn = held !== null && drawn === held.blobUrl;
  const leaving =
    !heldDrawn && state.hash !== hash && state.hash !== null && state.blobUrl
      ? { hash: state.hash, blobUrl: state.blobUrl }
      : null;
  const kept = leaving ?? held;
  // A return to the kept level: the effect below adopts it, and until it has,
  // this render already reads as adopted — idle would report a 0 % download
  // that is not happening.
  const adopting = kept !== null && kept.hash === hash;
  const live: Progress =
    state.hash === hash ? state : adopting ? { blobUrl: kept.blobUrl, received: size, failed: null } : IDLE;
  // `held` is kept only to stay on screen while a finer level downloads. Once
  // something else is drawn — this level's own blob, or the coarsest level by
  // its asset route, which is never streamed — nothing can show it again.
  const heldOffScreen = held !== null && drawn !== null && drawn !== held.blobUrl;
  useEffect(() => {
    if (!heldOffScreen || !heldRef.current) return;
    // `held` can trail `heldRef` by a commit: the cleanup's setHeld is a
    // default-lane update, while `drawn` lands in the sync render the mesh's
    // layout effect schedules. A level change that swaps in the level being
    // left as drawn therefore reads the stale `held` as off screen while the
    // ref already holds the drawn blob — never revoke that one.
    if (drawnRef.current === heldRef.current.blobUrl) return;
    URL.revokeObjectURL(heldRef.current.blobUrl);
    heldRef.current = null;
    setHeld(null);
  }, [heldOffScreen, held]);

  // Declared after the download so its cleanup runs after that one on
  // unmount, and so also revokes the blob that cleanup has just handed over.
  useEffect(
    () => () => {
      if (heldRef.current) URL.revokeObjectURL(heldRef.current.blobUrl);
      heldRef.current = null;
    },
    [],
  );

  return { blobUrl: live.blobUrl, received: live.received, failed: live.failed, held: adopting ? null : kept };
}
