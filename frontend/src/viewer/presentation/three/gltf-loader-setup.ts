import { useGLTF } from "@react-three/drei";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { BufferGeometry, Mesh } from "three";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";
import type {
  KTX2Loader as StdlibKTX2Loader,
  GLTFLoader,
} from "three-stdlib";

// One-time prototype patch: route every Mesh.raycast through three-mesh-bvh's
// accelerated implementation. Without a BVH the accelerated path falls back
// to the stock raycast, so this is safe for meshes we don't explicitly
// compute a bounds tree on — only the territory builds one (see
// gltf-model.tsx). With a BVH, raycast against a triangle-rich territory
// drops from ~5ms to ~50µs, which is what makes per-frame snap-to-surface
// during a placement drag stop micro-freezing.
//
// Patching here (not in a useEffect) guarantees the new method is in place
// before any useGLTF call resolves a Mesh — gltf-model.tsx imports this
// module, so module init runs first.
// three ships an ambient declaration of computeBoundsTree that pre-types
// the prototype slot to MeshBVH; three-mesh-bvh's exported function is
// typed against GeometryBVH (a structural subset). The runtime is correct
// — same function, same behaviour — only the declared return type
// disagrees, so cast through unknown to silence TS without leaking any.
BufferGeometry.prototype.computeBoundsTree =
  computeBoundsTree as unknown as typeof BufferGeometry.prototype.computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

// Module-level side effect: register the self-hosted Draco decoder under
// /public/draco. Without this, GLBs that carry KHR_draco_mesh_compression
// silently parse to an empty scene. Importing this module from any
// useGLTF call site guarantees the path is set before parsing starts.
useGLTF.setDecoderPath("/draco/");

// Singleton KTX2Loader for the whole app. drei v10 has no global
// setKTX2Loader hook, so each useGLTF call must attach this loader via
// the extendLoader callback. The transcoder is self-hosted under
// /public/basis.
//
// Why three's own KTX2Loader (not three-stdlib's): the basis transcoder
// blob (basis_transcoder.{js,wasm}) ships with three.js and is bumped in
// lockstep with three's KTX2Loader. three-stdlib lags one or two minor
// versions behind, and a Worker-protocol mismatch between the loader and
// the bundled transcoder would silently fall back to undecoded textures
// — the model renders white because the transcoder produced nothing,
// not because basis decoding "worked but with RGBA8 fallback". The
// runtime API of both loaders is identical; we cast at the
// setKTX2Loader call to satisfy three-stdlib's GLTFLoader type.
export const ktx2Loader = new KTX2Loader().setTranscoderPath("/basis/");

// extendGltfLoader is the callback we hand to every useGLTF / useGLTF.preload
// call. It attaches the KTX2 transcoder to the underlying GLTFLoader so
// KHR_texture_basisu textures decode instead of rendering as solid colour.
// Draco is wired up by drei automatically once setDecoderPath has been
// called.
export function extendGltfLoader(loader: GLTFLoader): void {
  loader.setKTX2Loader(ktx2Loader as unknown as StdlibKTX2Loader);
}
