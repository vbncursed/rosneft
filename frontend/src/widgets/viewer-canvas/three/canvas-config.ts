// Stable literal references so react-three-fiber doesn't tear down and
// recreate the gridHelper / background colour on every render of this
// component. R3F reconciles `args` by reference; new array literals each
// render trigger a dispose+reconstruct cycle for the underlying
// THREE.Object3D — which is why the two coloured ones are memoised on
// `colors` rather than written inline.
// near=0.1 (not 0.01) keeps the depth-buffer precision sane against
// far=500 — log2(500/0.1) fits a 24-bit depth buffer comfortably; 500/0.01
// invites Z-fighting on coplanar geometry without a measurable benefit
// at the converter's normalised scale (max-axis = 2).
export const CAMERA = { position: [0, 0, 3] as [number, number, number], fov: 50, near: 0.1, far: 500 };
// A fixed density range. drei's AdaptiveDpr used to sit here, but it only
// moves dpr when something calls `regress()`, and nothing does — CameraRig
// drives three-stdlib's controls directly — so it never changed a pixel.
// 1.5 is the ceiling this viewer has always rendered at; whether a retina
// screen should get 2 is a cost call for a real GPU, not swiftshader.
export const DPR_RANGE: [number, number] = [1, 1.5];
export const GL_CONFIG = { antialias: true, alpha: false };
export const GRID_POSITION: [number, number, number] = [0, -1.2, 0];
