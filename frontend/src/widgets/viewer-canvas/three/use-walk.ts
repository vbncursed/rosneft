import { useEffect, useRef, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3, type Object3D, type PerspectiveCamera } from "three";
import {
  poseOf,
  walkClip,
  walkScale,
  type FreePose,
  type GroundAt,
  type WalkScale,
  type WallAt,
} from "../model/free-cam";
import { applyPose, setClip } from "./free-cam-writes";
import { useAutoLodBus } from "./settle-bus";
import { hitsWithin, raycastSurfaceY } from "./snap-to-surface";

// Outside the hook, like free-cam-writes: the pose ref is the rig's, handed in as an argument.
const putPose = (ref: RefObject<FreePose | null>, value: FreePose) => {
  ref.current = value;
};

/** What a walking frame needs: the sizes in scene units, a way to find the ground and one to find a wall. */
export type Walking = { scale: WalkScale; groundAt: GroundAt; wallAt: WallAt };

type WalkParams = {
  walk: boolean;
  /** Metres per scene unit: the eye, the step and the clip are sized by it. */
  unitRatio: number;
  sceneRef: RefObject<Object3D | null>;
  /** The rig's pose: walking writes the eye height and the ground into it. */
  pose: RefObject<FreePose | null>;
  /** Walking and flying count speed in different units: the rig's wheel multiplier goes back to ×1 here. */
  restartSpeed: () => void;
  /** Nothing to stand on under the camera. */
  onRefused: () => void;
};

/**
 * Walk (G inside the free cam): stands the camera at eye height over the
 * surface straight below it — read from where the camera is now, since drei's
 * Bounds may have moved it since the rig took its pose — and narrows the clip
 * planes to a person's. Refuses when there is nothing below. On the way back
 * to flying it puts the free cam's planes back and leaves the camera where it
 * stands, at rest.
 *
 * FreeCamRig calls this before its own setup effect: React cleans effects up
 * in that order, so leaving the free cam straight from a walk restores the
 * free cam's planes here first and the orbit's in the rig last.
 */
export function useWalk({
  walk,
  unitRatio,
  sceneRef,
  pose,
  restartSpeed,
  onRefused,
}: WalkParams): RefObject<Walking | null> {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const invalidate = useThree((s) => s.invalidate);
  const bus = useAutoLodBus();
  const walking = useRef<Walking | null>(null);

  useEffect(() => {
    restartSpeed();
    if (!walk) return;
    const scene = sceneRef.current;
    const here = poseOf(camera.position, camera.quaternion);
    const ground = scene ? raycastSurfaceY(scene, here.position.x, here.position.z, here.position.y) : null;
    if (!scene || ground === null) {
      onRefused();
      return;
    }
    const scale = walkScale(unitRatio);
    const flying = { near: camera.near, far: camera.far };
    setClip(camera, walkClip(unitRatio, flying.far));
    const standing = { ...here, ground, position: here.position.clone().setY(ground + scale.eye) };
    putPose(pose, standing);
    applyPose(camera, standing);
    walking.current = {
      scale,
      groundAt: (x, z, fromY) => raycastSurfaceY(scene, x, z, fromY),
      wallAt: (from, dir, reach) => hitsWithin(scene, from, dir, reach),
    };
    bus.settle();
    invalidate();
    return () => {
      walking.current = null;
      setClip(camera, flying);
      const last = pose.current;
      if (last) pose.current = { ...last, velocity: new Vector3() };
      invalidate();
    };
  }, [walk, unitRatio, sceneRef, pose, restartSpeed, onRefused, camera, invalidate, bus]);

  return walking;
}
