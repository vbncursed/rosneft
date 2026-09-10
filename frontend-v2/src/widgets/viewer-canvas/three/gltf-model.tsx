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
  /** Reference-stable (useCallback) from the page, or the report effect loops. */
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
  const target = pickLod(lods, targetLod);
  const download = useLodDownload(target && lods.length > 1 ? target : null);
  const urlOf = (a: LodArtifact) =>
    a.hash === target?.hash && download.blobUrl ? download.blobUrl : lodUrl(a);
  const lod = useProgressiveLod(lods, targetLod, urlOf);
  // The warm level's download is what LodWarmer parses; until the blob exists
  // there is nothing to warm.
  const warmUrl = lod.warmUrl && download.blobUrl ? download.blobUrl : null;

  // `lod`'s callbacks are fresh closures on every render by design (see
  // use-progressive-lod), so an effect that named one would fire on every
  // render instead of on the fact it cares about. Held in a ref, the same way
  // LodWarmer holds its onReady, so each effect keys on its trigger alone.
  const latest = useRef(lod);
  useEffect(() => {
    latest.current = lod;
  });

  useEffect(() => {
    if (download.failed) latest.current.onWarmFailed();
  }, [download.failed]);

  // The page's Retry bumps retryVersion; that clears the failure and the
  // broken set, and re-keys the boundary so the fresh subtree may mount.
  // Never on mount: a level that throws during the very first render has its
  // failure set before any effect runs, and an unguarded call here wiped it
  // again — the error card never appeared and the scene stayed empty.
  const armed = useRef(retryVersion);
  useEffect(() => {
    if (armed.current === retryVersion) return;
    armed.current = retryVersion;
    latest.current.retry();
  }, [retryVersion]);

  // drei's useGLTF cache is keyed by URL string, and a revoked blob URL is
  // never re-requested — so the entry has to go before useLodDownload revokes
  // the blob it names. This cleanup runs on the same unmount/level change.
  useEffect(() => {
    const url = download.blobUrl;
    if (!url) return;
    return () => useGLTF.clear(url);
  }, [download.blobUrl]);

  useEffect(() => {
    const p =
      target && lod.shown && lod.shown.hash !== target.hash
        ? lodProgress(download.received, target.size)
        : null;
    onReport({
      shown: lod.shown?.lod ?? null,
      target: target?.lod ?? null,
      percent: p?.percent ?? null,
      progressText: p?.text ?? null,
      failure: lod.failure,
    });
  }, [lod.shown, target, download.received, lod.failure, onReport]);

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
