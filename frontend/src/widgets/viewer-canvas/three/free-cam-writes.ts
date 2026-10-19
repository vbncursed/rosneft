import { Euler, type PerspectiveCamera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { FreePose } from "../model/free-cam";

// Outside any component, like panorama-drag-controller's setOrbit: these are
// three.js objects and a DOM node, not React state. FreeCamRig and useWalk
// both write through them.
export const setEnabled = (controls: OrbitControlsImpl, on: boolean) => {
  controls.enabled = on;
};
export const setCursor = (canvas: HTMLElement, cursor: string) => {
  canvas.style.cursor = cursor;
};
export const setClip = (camera: PerspectiveCamera, planes: { near: number; far: number }) => {
  camera.near = planes.near;
  camera.far = planes.far;
  camera.updateProjectionMatrix();
};
export const applyPose = (camera: PerspectiveCamera, pose: FreePose) => {
  camera.position.copy(pose.position);
  camera.quaternion.setFromEuler(new Euler(pose.pitch, pose.yaw, 0, "YXZ"));
};
