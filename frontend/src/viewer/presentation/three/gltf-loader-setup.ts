import { useGLTF } from "@react-three/drei";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import type {
  KTX2Loader as StdlibKTX2Loader,
  GLTFLoader,
} from "three-stdlib";

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
