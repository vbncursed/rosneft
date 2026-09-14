import { Suspense, useEffect, useLayoutEffect, useRef, type Ref } from "react";
import { useGLTF } from "@react-three/drei";
import type { Group, Mesh } from "three";
import { pickLod, type LodArtifact } from "@/entities/scene";
import { lodProgress, lodUrl, useLodDownload, useProgressiveLod } from "@/features/lod";
import type { LodReport } from "../ui/props";
import { extendGltfLoader } from "./gltf-loader-setup";
import LodWarmer from "./lod-warmer";
import LodErrorBoundary from "./lod-error-boundary";

interface GltfModelProps {
  lods: LodArtifact[];
  targetLod: number;
  /** Bumped by the page's Retry: re-arms the boundary and clears the failure. */
  retryVersion: number;
  // Raycastable toggles whether ray-mesh intersection is enabled on this
  // subtree. R3F's event system raycasts through the entire scene on
  // pointer/wheel events, and a triangle-rich territory mesh becomes a
  // ~100ms hot spot on every wheel tick. The measure/place tools flip this on
  // when the user actually needs surface picking; otherwise we no-op the
  // raycast and let the wheel handler stay cheap.
  raycastable: boolean;
  // Forwarded so other layers (placement snap-to-surface) can call the
  // mesh's original raycast directly without flipping the public flag.
  groupRef?: Ref<Group>;
  onReport: (report: LodReport) => void;
}

// Three.Mesh.prototype.raycast iterates every triangle to find ray
// intersections. Replacing it with this no-op short-circuits the test
// without touching the underlying geometry.
const noopRaycast = () => undefined;

// three's FileLoader throws an HttpError carrying the response; a transcoder
// or parse failure carries nothing at all.
const statusOf = (err: unknown): { status: number | null } => {
  const e = err as { response?: { status?: number }; status?: number } | null;
  return { status: e?.response?.status ?? e?.status ?? null };
};

function GltfPrimitive({
  url,
  raycastable,
  groupRef,
}: {
  url: string;
  raycastable: boolean;
  groupRef?: Ref<Group>;
}) {
  // mesh-worker has already centered + scaled (max axis = 2) and
  // converted Z-up → Y-up, so we render the scene as-is. extendGltfLoader
  // wires up KTX2 transcoding; Draco is enabled via the second arg.
  const { scene } = useGLTF(url, true, true, extendGltfLoader);

  // The first time we see a mesh, stash its real raycast in userData so
  // any layer that needs surface intersection (placement snap, measure
  // tool, programmatic raycast) can invoke it even while raycastable is
  // false. After that we only swap m.raycast between noop and the cached
  // origRaycast — never overwrite userData.origRaycast again.
  useLayoutEffect(() => {
    scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      // Build a BVH once per geometry. acceleratedRaycast (set globally in
      // gltf-loader-setup.ts) reads geometry.boundsTree and falls back to
      // the stock per-triangle scan when absent, so this is the place that
      // unlocks ~100x faster raycasts on the territory mesh — vital for
      // per-frame snap-to-surface during a placement drag.
      if (!m.geometry.boundsTree) m.geometry.computeBoundsTree();
      if (!m.userData.origRaycast) m.userData.origRaycast = m.raycast;
      const orig = m.userData.origRaycast as Mesh["raycast"];
      m.raycast = raycastable ? orig : noopRaycast;
    });
  }, [scene, raycastable]);

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

// GltfModel renders the territory progressively: the coarsest level in the
// chain mounts first so there is something on screen while the target is
// still on the wire, then the target replaces it.
//
// This is NOT drei's <Detailed>: the level on screen does not depend on camera
// distance. A territory is usually framed whole, so distance-based switching
// would leave it coarse forever, and the measure tool's raycast would land on
// different geometry depending on zoom.
//
// The target is fetched by hand (useLodDownload) rather than by drei, because
// drei's loader reports no progress — the page's chip needs bytes. The blob
// URL that download mints is what both the warmer and the primitive parse, so
// the bytes travel once.
export default function GltfModel({
  lods,
  targetLod,
  retryVersion,
  raycastable,
  groupRef,
  onReport,
}: GltfModelProps) {
  // The raw target is what gets downloaded by hand; `lod.target` is the same
  // level until one drops out of the chain, and from then on it is the next
  // one down. The report reads `lod.target`, the download keys on the raw one.
  //
  // ponytail: only the *wanted* level is ever downloaded through a blob. When
  // that one is refused, `useProgressiveLod` drops it and targets the next level
  // down, which drei then fetches itself — no blob, so no warmer mounts and no
  // bytes are counted. The chip therefore shows no percent at all rather than a
  // stale or zero one (see the report below). Hand useLodDownload the level
  // useProgressiveLod actually wants if a percent for that case matters.
  const wanted = pickLod(lods, targetLod);
  const download = useLodDownload(wanted && lods.length > 1 ? wanted : null);
  const urlOf = (a: LodArtifact) =>
    a.hash === wanted?.hash && download.blobUrl ? download.blobUrl : lodUrl(a);
  const lod = useProgressiveLod(lods, targetLod, urlOf);
  // The warm level's download is what LodWarmer parses; until the blob exists
  // there is nothing to warm.
  const warmUrl = lod.warmUrl && download.blobUrl ? download.blobUrl : null;

  // `lod`'s callbacks are fresh closures on every render by design (see
  // use-progressive-lod), and a page that forgot a useCallback would hand us a
  // fresh onReport too. Both are held in a ref, the same way LodWarmer holds
  // its onReady, so each effect below keys on its trigger alone and fires once
  // per fact rather than once per render of whatever is above us.
  // Every url this component may have handed drei, so a retry can evict them.
  const urls = [...lods.map(lodUrl), ...(download.blobUrl ? [download.blobUrl] : [])];
  const latest = useRef({ lod, onReport, urls });
  useEffect(() => {
    latest.current = { lod, onReport, urls };
  });

  useEffect(() => {
    if (download.failed) latest.current.lod.onWarmFailed();
  }, [download.failed]);

  // The page's Retry bumps retryVersion; that clears the failure and the
  // broken set, and re-keys the boundary so the fresh subtree may mount.
  // Never on mount: a level that throws during the very first render has its
  // failure set before any effect runs, and an unguarded call here wiped it
  // again — the error card never appeared and the scene stayed empty.
  //
  // The eviction is not housekeeping, it is the retry. drei's useGLTF goes
  // through suspend-react, which keeps a rejected load under its key and
  // re-throws it on the next suspend of the same url — so a remount alone
  // threw the *cached* rejection before a frame was drawn, and Try again could
  // never recover however healthy the asset had become. Clearing the whole
  // chain rather than the failed hash alone costs one map lookup per level and
  // needs no bookkeeping about which url the throw came from (the blob, or the
  // asset route behind it).
  const armed = useRef(retryVersion);
  useEffect(() => {
    if (armed.current === retryVersion) return;
    armed.current = retryVersion;
    for (const url of latest.current.urls) useGLTF.clear(url);
    latest.current.lod.retry();
  }, [retryVersion]);

  // drei caches the parsed GLTF by URL string. useLodDownload revokes the blob
  // URL when the level changes or we unmount — and its cleanup runs first,
  // this hook being declared after it — so without this the parsed scene would
  // sit in that cache forever under a URL no one can ever request again.
  // Nothing evicts it; the entry has to be dropped by hand.
  useEffect(() => {
    const url = download.blobUrl;
    if (!url) return;
    return () => useGLTF.clear(url);
  }, [download.blobUrl]);

  useEffect(() => {
    // No warm url means nothing is on the wire for the target — a refused
    // download, or drei fetching the fallback itself — and a percent then reads
    // as progress that is not happening. `0 %` against a level nobody is
    // fetching is worse than no chip at all.
    const p =
      warmUrl && lod.target && lod.shown && lod.shown.hash !== lod.target.hash
        ? lodProgress(download.received, lod.target.size)
        : null;
    latest.current.onReport({
      shown: lod.shown?.lod ?? null,
      target: lod.target?.lod ?? null,
      percent: p?.percent ?? null,
      progressText: p?.text ?? null,
      failure: lod.failure,
    });
  }, [lod.shown, lod.target, download.received, lod.failure, warmUrl]);

  if (!lod.url) return null;
  return (
    <>
      <LodErrorBoundary
        resetKey={`${lod.url}#${retryVersion}`}
        onError={(err) => lod.onShownFailed(statusOf(err))}
      >
        <Suspense fallback={null}>
          <GltfPrimitive url={lod.url} raycastable={raycastable} groupRef={groupRef} />
        </Suspense>
      </LodErrorBoundary>
      {warmUrl ? <LodWarmer url={warmUrl} onReady={lod.onWarmReady} /> : null}
    </>
  );
}
