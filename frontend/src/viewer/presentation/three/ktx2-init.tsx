import { useThree } from "@react-three/fiber";
import { ktx2Loader } from "@/viewer/presentation/three/gltf-loader-setup";

// KTX2Loader's `workerConfig` is null until detectSupport has been called
// — checking it on the loader itself (no module-level mutable flag) keeps
// React happy about render-time idempotency while still gating the probe
// to once per session.
interface KTX2WorkerConfigured {
  workerConfig: unknown;
}

// Ktx2Init runs detectSupport(renderer) at *render time* — KTX2Loader
// throws "Missing initialization with .detectSupport( renderer )" the
// moment any GLB tries to decode a KTX2 texture without it. Doing the
// call synchronously inside the render of a child placed before the
// first <GltfModel> guarantees the loader is configured before any
// sibling useGLTF can resolve its parse promise. A useLayoutEffect
// here would race against hot-cache GLBs that parse in a microtask
// before effects flush.
//
// Render-time side effects normally raise eyebrows; here it's a
// one-time, idempotent capability probe gated by the loader's own
// internal state, and useThree(s => s.gl) is the only way to access
// the renderer that's owned by Canvas.
export default function Ktx2Init() {
  const gl = useThree((s) => s.gl);
  const loader = ktx2Loader as unknown as KTX2WorkerConfigured;
  if (loader.workerConfig === null) {
    ktx2Loader.detectSupport(gl);
  }
  return null;
}
