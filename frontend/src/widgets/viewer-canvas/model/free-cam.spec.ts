import { BoxGeometry, Group, Mesh, Quaternion, Euler, Vector3, type Object3D } from "three";
import { describe, expect, it, vi } from "vitest";
import { hitsWithin, raycastSurfaceY } from "../three/snap-to-surface";
import {
  CLICK_SLOP_PX,
  clipPlanes,
  freeInput,
  freeSpeed,
  isMoveKey,
  lookStep,
  nextMultiplier,
  poseOf,
  stepFreeCam,
  stepWalk,
  walkClip,
  walkScale,
  walkSpeed,
  type FreeInput,
  type FreePose,
  type GroundAt,
  type WallAt,
  type WalkWorld,
} from "./free-cam";

const at = (yaw = 0, pitch = 0): FreePose => ({ position: new Vector3(), yaw, pitch, velocity: new Vector3() });
const go = (over: Partial<FreeInput>): FreeInput => ({
  forward: 0,
  right: 0,
  up: 0,
  boost: false,
  instant: true,
  ...over,
});

describe("stepFreeCam", () => {
  it("flies along the view: W is -Z at yaw 0, D is +X, E is world up", () => {
    expect(stepFreeCam(at(), go({ forward: 1 }), 1, 2).position.toArray()).toEqual(
      [0, 0, -2].map((v) => expect.closeTo(v)),
    );
    expect(stepFreeCam(at(), go({ right: 1 }), 1, 2).position.x).toBeCloseTo(2);
    expect(stepFreeCam(at(0, -1), go({ up: 1 }), 1, 2).position.toArray()).toEqual(
      [0, 2, 0].map((v) => expect.closeTo(v)),
    );
  });
  it("climbs with the view when it looks up — forward follows the pitch", () => {
    expect(stepFreeCam(at(0, Math.PI / 4), go({ forward: 1 }), 1, 1).position.y).toBeCloseTo(Math.SQRT1_2);
  });
  it("turns with the yaw: facing -X after a quarter turn left", () => {
    expect(stepFreeCam(at(Math.PI / 2), go({ forward: 1 }), 1, 1).position.x).toBeCloseTo(-1);
  });
  it("does not fly faster on a diagonal", () => {
    expect(stepFreeCam(at(), go({ forward: 1, right: 1, up: 1 }), 1, 1).position.length()).toBeCloseTo(1);
  });
  it("Shift multiplies the speed by four", () => {
    expect(stepFreeCam(at(), go({ forward: 1, boost: true }), 1, 1).position.z).toBeCloseTo(-4);
  });
  it("eases in and out over 0.12 s, and stops dead once released", () => {
    const first = stepFreeCam(at(), go({ forward: 1, instant: false }), 0.016, 1);
    expect(first.velocity.length()).toBeGreaterThan(0);
    expect(first.velocity.length()).toBeLessThan(1);
    let p = first;
    for (let i = 0; i < 60; i++) p = stepFreeCam(p, go({ instant: false }), 0.05, 1);
    expect(p.velocity.lengthSq()).toBe(0);
  });
  it("moves and stops at once under reduced motion", () => {
    const moving = stepFreeCam(at(), go({ forward: 1 }), 0.016, 1);
    expect(moving.velocity.length()).toBeCloseTo(1);
    expect(stepFreeCam(moving, go({}), 0.016, 1).velocity.lengthSq()).toBe(0);
  });
});

describe("lookStep", () => {
  it("turns right on a drag right and looks down on a drag down", () => {
    const p = lookStep(at(), 100, 50);
    expect(p.yaw).toBeCloseTo(-0.4);
    expect(p.pitch).toBeCloseTo(-0.2);
  });
  it("never tips over the pole", () => {
    expect(lookStep(at(), 0, -100_000).pitch).toBeLessThan(Math.PI / 2);
    expect(lookStep(at(), 0, 100_000).pitch).toBeGreaterThan(-Math.PI / 2);
  });
});

describe("poseOf", () => {
  it("reads yaw and pitch off a roll-free camera and starts at rest", () => {
    const q = new Quaternion().setFromEuler(new Euler(-0.3, 1.1, 0, "YXZ"));
    const p = poseOf(new Vector3(1, 2, 3), q);
    expect(p.yaw).toBeCloseTo(1.1);
    expect(p.pitch).toBeCloseTo(-0.3);
    expect(p.velocity.lengthSq()).toBe(0);
  });
});

describe("speed, keys and clip planes", () => {
  it("flies 0.4 territory radii a second, scaled by the wheel", () => {
    expect(freeSpeed(2, 1)).toBeCloseTo(0.8);
    expect(freeSpeed(2, 10)).toBeCloseTo(8);
  });
  it("keeps the wheel multiplier within 0.1–10, faster on a wheel up", () => {
    expect(nextMultiplier(1, -100)).toBeGreaterThan(1);
    expect(nextMultiplier(1, 100)).toBeLessThan(1);
    expect(nextMultiplier(1, -1e6)).toBe(10);
    expect(nextMultiplier(1, 1e6)).toBe(0.1);
  });
  it("maps the held codes onto axes, layout-independent", () => {
    expect(freeInput(new Set(["KeyW", "KeyD", "KeyE", "ShiftLeft"]))).toEqual({
      forward: 1,
      right: 1,
      up: 1,
      boost: true,
    });
    expect(freeInput(new Set(["KeyW", "KeyS", "KeyA", "KeyQ"]))).toEqual({
      forward: 0,
      right: -1,
      up: -1,
      boost: false,
    });
    expect(isMoveKey("KeyW")).toBe(true);
    expect(isMoveKey("KeyF")).toBe(false);
  });
  it("keeps the depth range Bounds itself uses (far/near = 10 000)", () => {
    const { near, far } = clipPlanes(1.7);
    expect(far / near).toBeCloseTo(10_000);
    expect(near).toBeLessThan(0.01);
  });
  it("treats under four pixels as a click", () => {
    expect(CLICK_SLOP_PX).toBe(4);
  });
});

describe("walking", () => {
  // 1 scene unit = 10 m: eye 0.18, step 0.05, fall 0.8 a second, knee 0.07, chest 0.12, body 0.03.
  const scale = walkScale(10);
  const flat =
    (y = 0): GroundAt =>
    () =>
      y;
  const standing = (over: Partial<FreePose> = {}): FreePose => ({
    position: new Vector3(0, scale.eye, 0),
    yaw: 0,
    pitch: 0,
    velocity: new Vector3(),
    ground: 0,
    ...over,
  });
  const world = (groundAt: GroundAt, dt = 1, speed = walkSpeed(10, 1), wallAt: WallAt = () => false): WalkWorld => ({
    dt,
    speed,
    scale,
    groundAt,
    wallAt,
  });
  /** Level ground and one wall in it. */
  const walled = (wallAt: WallAt, dt = 1) => world(flat(), dt, walkSpeed(10, 1), wallAt);
  /** A wall facing +Z, its face at z = `face`, from the ground up to `top`. */
  const wallFacing =
    (face: number, top = Infinity): WallAt =>
    (from, dir, reach) => {
      const t = (face - from.z) / dir.z;
      return from.y <= top && t >= 0 && t <= reach;
    };
  const near = (v: Vector3, x: number, y: number, z: number) => {
    expect(v.x).toBeCloseTo(x);
    expect(v.y).toBeCloseTo(y);
    expect(v.z).toBeCloseTo(z);
  };

  it("sizes the eye, the step, the fall and the probe in metres", () => {
    expect(walkScale(2)).toEqual({ eye: 0.9, step: 0.25, fall: 4, knee: 0.35, chest: 0.6, body: 0.15 });
  });

  it("walks 1.4 m/s, runs 4 m/s, and the wheel scales both", () => {
    expect(walkSpeed(10, 1)).toBeCloseTo(0.14);
    expect(walkSpeed(0.5, 1)).toBeCloseTo(2.8);
    expect(walkSpeed(10, 2)).toBeCloseTo(0.28);
    near(stepWalk(standing(), go({ forward: 1, boost: true }), world(flat())).position, 0, scale.eye, -0.4);
  });

  it("walks along the ground towards the yaw, whatever the pitch", () => {
    near(stepWalk(standing(), go({ forward: 1 }), world(flat())).position, 0, scale.eye, -0.14);
    near(stepWalk(standing({ pitch: -1 }), go({ forward: 1 }), world(flat())).position, 0, scale.eye, -0.14);
  });

  it("has no up or down: Q and E do nothing", () => {
    const p = stepWalk(standing(), go({ up: 1 }), world(flat()));
    near(p.position, 0, scale.eye, 0);
    expect(p.velocity.lengthSq()).toBe(0);
  });

  it("does not walk faster on a diagonal", () => {
    const p = stepWalk(standing(), go({ forward: 1, right: 1 }), world(flat()));
    expect(Math.hypot(p.position.x, p.position.z)).toBeCloseTo(0.14);
  });

  it("steps up a rise under the step and stands on it at once", () => {
    const kerb: GroundAt = (_x, z) => (z < -0.05 ? 0.03 : 0); // a 0.3 m kerb
    const p = stepWalk(standing(), go({ forward: 1 }), world(kerb));
    near(p.position, 0, 0.03 + scale.eye, -0.14);
    expect(p.ground).toBeCloseTo(0.03);
  });

  it("stops at a rise over the step", () => {
    const wall: GroundAt = (_x, z) => (z < -0.05 ? 0.2 : 0); // a 2 m wall
    near(stepWalk(standing(), go({ forward: 1 }), world(wall)).position, 0, scale.eye, 0);
  });

  it("slides along a wall: X first, then Z", () => {
    const ahead: GroundAt = (_x, z) => (z < -0.01 ? null : 0);
    const p = stepWalk(standing(), go({ forward: 1, right: 1 }), world(ahead));
    expect(p.position.x).toBeGreaterThan(0);
    expect(p.position.z).toBe(0);
    const aside: GroundAt = (x) => (x > 0.01 ? null : 0);
    const q = stepWalk(standing(), go({ forward: 1, right: 1 }), world(aside));
    expect(q.position.x).toBe(0);
    expect(q.position.z).toBeLessThan(0);
  });

  it("stops at the territory's edge, where nothing is underfoot", () => {
    const island: GroundAt = (x, z) => (x === 0 && z === 0 ? 0 : null);
    near(stepWalk(standing(), go({ forward: 1 }), world(island)).position, 0, scale.eye, 0);
  });

  it("sinks to lower ground at 8 m/s at most, keys up or not, and lands on it", () => {
    const ledge: GroundAt = (_x, z) => (z < -0.05 ? -1 : 0); // a 10 m drop
    const off = stepWalk(standing(), go({ forward: 1 }), world(ledge));
    expect(off.position.y).toBeCloseTo(-0.8 + scale.eye);
    const landed = stepWalk(off, go({}), world(ledge));
    expect(landed.position.y).toBeCloseTo(-1 + scale.eye);
  });

  it("looks for the ground from one step over the feet", () => {
    const calls = vi.fn<GroundAt>(() => 0);
    stepWalk(standing(), go({ forward: 1 }), world(calls));
    expect(calls.mock.calls[0][2]).toBeCloseTo(scale.step);
  });

  it("casts one ray for a clear step, three at most against a wall, none standing still", () => {
    const calls = vi.fn<GroundAt>(() => 0);
    stepWalk(standing(), go({ forward: 1 }), world(calls));
    expect(calls).toHaveBeenCalledOnce();
    calls.mockClear();
    calls.mockReturnValue(null);
    stepWalk(standing(), go({ forward: 1, right: 1 }), world(calls));
    expect(calls).toHaveBeenCalledTimes(3);
    calls.mockClear();
    stepWalk(standing(), go({}), world(calls));
    expect(calls).not.toHaveBeenCalled();
  });

  it("keeps a person's depth range, never deeper than the flight's", () => {
    expect(walkClip(10, 1000)).toEqual({ near: 0.01, far: 200 });
    expect(walkClip(10, 50).far).toBe(50);
  });

  it("stops at a wall over the knee, though the ground behind it would take the step", () => {
    // Level ground everywhere: the ray down alone walked through.
    near(stepWalk(standing(), go({ forward: 1 }), walled(wallFacing(-0.1))).position, 0, scale.eye, 0);
  });

  it("walks up to a wall and keeps a body's width off it", () => {
    // Steps of 0.014 so the gap closes in whole frames; a 0.14 step would refuse the wall outright.
    let p = standing();
    for (let i = 0; i < 20; i++) p = stepWalk(p, go({ forward: 1 }), walled(wallFacing(-0.1, 0.25), 0.1));
    expect(p.position.z).toBeLessThan(0);
    expect(p.position.z).toBeGreaterThan(-0.1 + scale.body - 1e-9);
  });

  it("climbs a kerb lower than the knee: the probe passes over it", () => {
    const kerb: GroundAt = (_x, z) => (z < -0.05 ? 0.03 : 0); // a 0.3 m kerb
    const p = stepWalk(standing(), go({ forward: 1 }), world(kerb, 1, walkSpeed(10, 1), wallFacing(-0.05, 0.03)));
    near(p.position, 0, 0.03 + scale.eye, -0.14);
  });

  it("slides along a wall it walks into at an angle", () => {
    const p = stepWalk(standing(), go({ forward: 1, right: 1 }), walled(wallFacing(-0.05)));
    expect(p.position.x).toBeGreaterThan(0);
    expect(p.position.z).toBe(0);
  });

  it("lets go of a wall it walks away from", () => {
    const p = stepWalk(
      standing({ position: new Vector3(0, scale.eye, -0.04) }),
      go({ forward: -1 }),
      walled(wallFacing(-0.05)),
    );
    expect(p.position.z).toBeGreaterThan(-0.04);
  });

  it("probes at the knee, then the chest, along the step, as far as the step and the body", () => {
    const wall = vi.fn<WallAt>(() => false);
    stepWalk(standing(), go({ forward: 1 }), walled(wall));
    expect(wall).toHaveBeenCalledTimes(2);
    const [[knee, dir, reach], [chest]] = wall.mock.calls;
    expect(knee.y).toBeCloseTo(scale.knee);
    expect(chest.y).toBeCloseTo(scale.chest);
    near(dir, 0, 0, -1);
    expect(reach).toBeCloseTo(0.14 + scale.body);
  });

  it("spares the chest ray when the knee already hit", () => {
    const wall = vi.fn<WallAt>(() => true);
    stepWalk(standing(), go({ forward: 1 }), walled(wall));
    expect(wall).toHaveBeenCalledOnce();
  });

  it("is not carried through a wall by a long frame: the probe reaches as far as the step", () => {
    // dt 10 s: a 1.4-unit step, a wall 1 unit ahead.
    near(stepWalk(standing(), go({ forward: 1 }), walled(wallFacing(-1), 10)).position, 0, scale.eye, 0);
  });

  it("stands still on a step that is not a number, and casts nothing", () => {
    const wall = vi.fn<WallAt>(() => false);
    const ground = vi.fn<GroundAt>(() => 0);
    near(
      stepWalk(standing(), go({ forward: 1 }), world(ground, Number.NaN, walkSpeed(10, 1), wall)).position,
      0,
      scale.eye,
      0,
    );
    expect(wall).not.toHaveBeenCalled();
    expect(ground).not.toHaveBeenCalled();
  });

  it("keeps the body's 0.3 m off a wall at any scale", () => {
    for (const unitRatio of [0.5, 10]) {
      const s = walkScale(unitRatio);
      const pose: FreePose = {
        position: new Vector3(0, s.eye, 0),
        yaw: 0,
        pitch: 0,
        velocity: new Vector3(),
        ground: 0,
      };
      // dt 0.01: a 1.4 cm step. A wall 0.25 m ahead stops it, one 0.4 m ahead does not.
      const probe = (m: number): WalkWorld => ({
        dt: 0.01,
        speed: walkSpeed(unitRatio, 1),
        scale: s,
        groundAt: flat(),
        wallAt: wallFacing(-m / unitRatio),
      });
      expect(stepWalk(pose, go({ forward: 1 }), probe(0.25)).position.z).toBe(0);
      expect(stepWalk(pose, go({ forward: 1 }), probe(0.4)).position.z).toBeLessThan(0);
    }
  });
});

describe("walking into real meshes", () => {
  // 1 scene unit = 1 m. A 10×1×10 slab whose top — the ground — is at y = 0.
  const scale = walkScale(1);
  const site = (...on: Mesh[]) => {
    const slab = new Mesh(new BoxGeometry(10, 1, 10));
    slab.position.y = -0.5;
    const group = new Group();
    group.add(slab, ...on);
    return group;
  };
  /** A box standing on the ground, its +Z face at z = `face`. */
  const block = (height: number, depth: number, face: number) => {
    const m = new Mesh(new BoxGeometry(4, height, depth));
    m.position.set(0, height / 2, face - depth / 2);
    return m;
  };
  /** 30 frames of 0.1 s walking north (1.4 m/s: 0.14 m a frame). */
  const walkNorth = (scene: Object3D) => {
    const w: WalkWorld = {
      dt: 0.1,
      speed: walkSpeed(1, 1),
      scale,
      groundAt: (x, z, fromY) => raycastSurfaceY(scene, x, z, fromY),
      wallAt: (from, dir, reach) => hitsWithin(scene, from, dir, reach),
    };
    let pose: FreePose = {
      position: new Vector3(0, scale.eye, 0),
      yaw: 0,
      pitch: 0,
      velocity: new Vector3(),
      ground: 0,
    };
    for (let i = 0; i < 30; i++) pose = stepWalk(pose, go({ forward: 1 }), w);
    return pose.position;
  };

  // Face at z = -1.05: five steps reach -0.70, 0.35 m off it; the next would leave 0.21 m.
  it("stops short of a building standing on the ground", () => {
    // Its floor is the slab: the ray down from one step over the feet found it, inside.
    expect(walkNorth(site(block(6, 4, -1.05))).z).toBeCloseTo(-0.7);
  });

  it("stops at a thin wall with level ground behind it", () => {
    expect(walkNorth(site(block(2, 0.05, -1.05))).z).toBeCloseTo(-0.7);
  });

  it("climbs a 0.3 m kerb and walks on along it", () => {
    const p = walkNorth(site(block(0.3, 4, -1.05)));
    expect(p.y).toBeCloseTo(0.3 + scale.eye);
    expect(p.z).toBeCloseTo(-4.2);
  });
});
