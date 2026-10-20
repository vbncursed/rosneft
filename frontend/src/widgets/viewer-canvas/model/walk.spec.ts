import { BoxGeometry, Group, Mesh, Vector3, type Object3D } from "three";
import { describe, expect, it, vi } from "vitest";
import { hitsWithin, raycastSurfaceY } from "../three/snap-to-surface";
import type { FreeInput, FreePose } from "./free-cam";
import { AIR_DRAG, stepWalk, walkClip, walkScale, walkSpeed, type GroundAt, type WallAt, type WalkWorld } from "./walk";

const go = (over: Partial<FreeInput>): FreeInput => ({
  forward: 0,
  right: 0,
  up: 0,
  boost: false,
  jump: false,
  instant: true,
  ...over,
});

describe("walking", () => {
  // 1 scene unit = 10 m: eye 0.18, step 0.05, knee 0.07, chest 0.12, body 0.03, over-step 0.002, gravity 0.98, terminal 3, jump 0.31.
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

  it("sizes the body, the step, gravity, the fall and the jump in metres", () => {
    expect(walkScale(2)).toEqual({
      eye: 0.9,
      step: 0.25,
      knee: 0.35,
      chest: 0.6,
      body: 0.15,
      head: 0.05,
      overStep: 0.01,
      gravity: 4.9,
      terminal: 15,
      jump: expect.closeTo(Math.sqrt(9.8) / 2, 6),
    });
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

  it("drops off a 10 m ledge under gravity, keys up or not, and lands on it", () => {
    const ledge: GroundAt = (_x, z) => (z < -0.05 ? -1 : 0); // a 10 m drop
    const off = stepWalk(standing(), go({ forward: 1 }), world(ledge));
    expect(off.vy).toBeCloseTo(-0.98);
    expect(off.position.y).toBeCloseTo(-0.49 + scale.eye);
    const landed = stepWalk(off, go({}), world(ledge));
    expect(landed.position.y).toBeCloseTo(-1 + scale.eye);
    expect(landed.vy).toBeUndefined();
  });

  it("looks for the ground from a knee over the feet, above any block a step climbs", () => {
    const calls = vi.fn<GroundAt>(() => 0);
    stepWalk(standing(), go({ forward: 1 }), world(calls));
    expect(calls.mock.calls[0][2]).toBeCloseTo(scale.knee);
  });

  it("casts one ray for a clear step and one standing still, four at most against a wall", () => {
    const calls = vi.fn<GroundAt>(() => 0);
    stepWalk(standing(), go({ forward: 1 }), world(calls));
    expect(calls).toHaveBeenCalledOnce();
    calls.mockClear();
    // Standing still it still looks down: an object hidden underfoot must stop holding.
    stepWalk(standing(), go({}), world(calls));
    expect(calls).toHaveBeenCalledOnce();
    calls.mockClear();
    calls.mockReturnValue(null);
    stepWalk(standing(), go({ forward: 1, right: 1 }), world(calls));
    expect(calls).toHaveBeenCalledTimes(4);
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

  it("probes just over a step, then the knee and the chest, along the step, the first as far as the frame's move", () => {
    const wall = vi.fn<WallAt>(() => false);
    stepWalk(standing(), go({ forward: 1 }), walled(wall));
    // Three level probes, not two: the over-step one catches a thin rail the knee passes over. One up after them.
    expect(wall).toHaveBeenCalledTimes(4);
    const [[over, dir, overReach], [knee, , kneeReach], [chest], [head, up, headReach]] = wall.mock.calls;
    expect(over.y).toBeCloseTo(scale.step + scale.overStep);
    expect(overReach).toBeCloseTo(0.14);
    expect(knee.y).toBeCloseTo(scale.knee);
    expect(chest.y).toBeCloseTo(scale.chest);
    near(dir, 0, 0, -1);
    expect(kneeReach).toBeCloseTo(0.14 + scale.body);
    // The headroom ray: from the chest at the new ground, up to the top of the head.
    near(up, 0, 1, 0);
    expect(head.y).toBeCloseTo(scale.chest);
    expect(headReach).toBeCloseTo(scale.eye + scale.head - scale.chest);
  });

  it("will not walk under a beam between the level probes: the head would pass through it", () => {
    // A slab with its underside 1.5 m up (0.15 here): above the chest probe, below the over-the-head one.
    const beam: WallAt = (from, dir, reach) => dir.y > 0 && from.y < 0.15 && from.y + reach >= 0.15;
    const p = stepWalk(standing(), go({ forward: 1 }), walled(beam));
    near(p.position, 0, scale.eye, 0);
  });

  it("will not climb a step onto ground with a ceiling over it", () => {
    const kerb: GroundAt = (_x, z) => (z < -0.05 ? 0.03 : 0); // a 0.3 m kerb
    // Room over the ground (0.03) is 0.18 + 0.01 - 0.12 from 0.03 + 0.12: the slab sits right over the kerb.
    const low: WallAt = (from, dir, reach) => dir.y > 0 && from.y + reach >= 0.2;
    const p = stepWalk(standing(), go({ forward: 1 }), world(kerb, 1, walkSpeed(10, 1), low));
    expect(p.position.y).toBeCloseTo(scale.eye);
  });

  it("spares the chest ray when the knee already hit", () => {
    const wall = vi.fn<WallAt>(() => true);
    stepWalk(standing(), go({ forward: 1 }), walled(wall));
    // Only the over-step probe runs, once for each try (whole step, X, Z): never the knee or the chest.
    expect(wall.mock.calls.filter(([, dir]) => dir.y === 0).every(([from]) => from.y < scale.knee)).toBe(true);
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

describe("jumping and falling", () => {
  /** Flat ground at `groundAt`'s height, no walls, at `dt` a frame. */
  const worldOf = (unitRatio = 1, groundAt: GroundAt = () => 0, dt = 1 / 60): WalkWorld => ({
    dt,
    speed: walkSpeed(unitRatio, 1),
    scale: walkScale(unitRatio),
    groundAt,
    wallAt: () => false,
  });
  const standOn = (unitRatio = 1, over: Partial<FreePose> = {}): FreePose => ({
    position: new Vector3(0, walkScale(unitRatio).eye, 0),
    yaw: 0,
    pitch: 0,
    velocity: new Vector3(),
    ground: 0,
    ...over,
  });
  const feetOf = (p: FreePose, unitRatio = 1) => p.position.y - walkScale(unitRatio).eye;
  /** One press of Space, then frames until the walker stands again: the highest feet, the frames taken, the pose it lands in. */
  const hop = (unitRatio = 1) => {
    const w = worldOf(unitRatio);
    let p = stepWalk(standOn(unitRatio), go({ jump: true }), w);
    let top = feetOf(p, unitRatio);
    let frames = 1;
    while (p.vy !== undefined && frames < 600) {
      p = stepWalk(p, go({}), w);
      top = Math.max(top, feetOf(p, unitRatio));
      frames++;
    }
    return { p, top, frames };
  };

  it("jumps 0.5 m and is down again in about 0.64 s, at any scale", () => {
    const m = hop(1);
    expect(m.top).toBeCloseTo(0.5, 2);
    expect(m.frames / 60).toBeCloseTo(0.64, 1);
    expect(m.p.vy).toBeUndefined();
    expect(feetOf(m.p)).toBe(0);
    expect(hop(10).top).toBeCloseTo(0.05, 3);
  });

  it("a jump pressed in the frame the walker climbs a step still leaves the ground upward", () => {
    const kerb: GroundAt = (_x, z) => (z < -0.05 ? 0.3 : 0); // a 0.3 m kerb, reached this frame
    const p = stepWalk(
      standOn(1, { position: new Vector3(0, walkScale(1).eye, -0.04) }),
      go({ forward: 1, jump: true }),
      worldOf(1, kerb),
    );
    expect(p.vy).toBeGreaterThan(0);
    expect(feetOf(p)).toBeGreaterThan(0.3);
  });

  it("a jump under a low ceiling goes nowhere: the rise is cancelled and the walker is down again", () => {
    const ceiling = 1.9; // the eye is 1.8 m up and the head 0.1 m over it: no room to rise
    const wallAt: WallAt = (from, dir, reach) => dir.y > 0 && from.y + reach >= ceiling;
    const w = { ...worldOf(), wallAt };
    let p = stepWalk(standOn(), go({ jump: true }), w);
    expect(feetOf(p)).toBe(0);
    expect(p.vy).toBeUndefined();
    // Under a ceiling a jump would clear, the walker still jumps.
    p = stepWalk(standOn(), go({ jump: true }), {
      ...w,
      wallAt: (from, dir, reach) => dir.y > 0 && from.y + reach >= 9,
    });
    expect(p.vy).toBeGreaterThan(0);
  });

  it("a head that meets a ceiling mid-jump stops there, at any frame rate, and falls", () => {
    const ceiling = 2.1; // room for the head to rise 0.2 m: 2.1 - 0.1 - 1.8
    const tops = [1 / 240, 1 / 60, 0.1].map((dt) => {
      const w = {
        ...worldOf(1, () => 0, dt),
        wallAt: ((from, dir, reach) => dir.y > 0 && from.y + reach >= ceiling) as WallAt,
      };
      let p = stepWalk(standOn(), go({ jump: true }), w);
      let top = feetOf(p);
      for (let i = 0; i < 600 && p.vy !== undefined; i++) {
        p = stepWalk(p, go({}), w);
        top = Math.max(top, feetOf(p));
      }
      expect(p.vy).toBeUndefined();
      return top;
    });
    for (const top of tops) expect(top).toBeCloseTo(0.2, 2);
  });

  it("does not jump again in the air", () => {
    const up = stepWalk(standOn(), go({ jump: true }), worldOf());
    const next = stepWalk(up, go({ jump: true }), worldOf());
    expect(next.vy).toBeCloseTo((up.vy ?? 0) - 9.8 / 60);
  });

  it("falls no faster than 30 m/s", () => {
    let p = standOn(1, { position: new Vector3(0, 5000, 0), vy: 0 });
    for (let i = 0; i < 300; i++) p = stepWalk(p, go({}), worldOf());
    expect(p.vy).toBe(-30);
  });

  it("bleeds the take-off speed in the air with the keys up, at AIR_DRAG a second", () => {
    let p = stepWalk(standOn(1, { velocity: new Vector3(0, 0, -1.4) }), go({ forward: 1, jump: true }), worldOf());
    for (let i = 0; i < 10; i++) p = stepWalk(p, go({}), worldOf());
    expect(p.vy).toBeDefined();
    expect(p.velocity.z).toBeCloseTo(-1.4 * Math.exp((-AIR_DRAG * 10) / 60), 6);
  });

  it("turns in the air by 30 % of the wish's speed a second, so never round", () => {
    let p = stepWalk(standOn(1, { velocity: new Vector3(0, 0, -1.4) }), go({ forward: 1, jump: true }), worldOf());
    for (let i = 0; i < 10; i++) p = stepWalk(p, go({ forward: -1 }), worldOf());
    // Each frame turns by 0.3 · 1.4 · dt, then bleeds by e^(-AIR_DRAG · dt): the geometric sum of those.
    const a = Math.exp(-AIR_DRAG / 60);
    const turn = (0.3 * 1.4) / 60;
    expect(p.vy).toBeDefined();
    expect(p.velocity.z).toBeCloseTo(a ** 10 * -1.4 + (turn * a * (1 - a ** 10)) / (1 - a), 5);
  });

  describe("air drag", () => {
    /** Ground far below every test's fall: the walker never lands, so its velocity is the flight's. */
    const abyss = (): GroundAt => () => -1e6;

    it("bleeds a 4 m/s take-off to about 4 · e^-AIR_DRAG after a second in the air", () => {
      let p = standOn(1, { velocity: new Vector3(0, 0, -4), vy: 0 });
      const w = worldOf(1, abyss());
      for (let i = 0; i < 60; i++) p = stepWalk(p, go({}), w);
      expect(p.vy).toBeDefined();
      expect(Math.abs(p.velocity.z)).toBeCloseTo(4 * Math.exp(-AIR_DRAG), 3);
    });

    it("is the same whatever the frame: one 0.1 s frame as a hundred 1 ms ones", () => {
      const start = standOn(1, { position: new Vector3(0, 5, 0), velocity: new Vector3(0, 0, -4), vy: 0 });
      const one = stepWalk(start, go({}), worldOf(1, abyss(), 0.1));
      let many = start;
      for (let i = 0; i < 100; i++) many = stepWalk(many, go({}), worldOf(1, abyss(), 0.001));
      expect(one.velocity.z).toBeCloseTo(many.velocity.z, 9);
    });

    it("does not bleed on the ground: only the ease takes the speed down", () => {
      const p = stepWalk(
        standOn(1, { velocity: new Vector3(0, 0, -1.4) }),
        go({ instant: false }),
        worldOf(1, () => 0, 0.04),
      );
      expect(p.vy).toBeUndefined();
      expect(p.velocity.z).toBeCloseTo(-1.4 * Math.exp(-0.5), 6);
    });

    it("leaves a running jump's height at 0.5 m, and clears vy on landing", () => {
      const w = worldOf();
      let p = stepWalk(standOn(1, { velocity: new Vector3(0, 0, -1.4) }), go({ forward: 1, jump: true }), w);
      let top = feetOf(p);
      for (let i = 0; i < 600 && p.vy !== undefined; i++) {
        p = stepWalk(p, go({ forward: 1 }), w);
        top = Math.max(top, feetOf(p));
      }
      expect(top).toBeCloseTo(0.5, 2);
      expect(p.vy).toBeUndefined();
    });

    it("covers the same metres at any unit ratio", () => {
      const metres = (unitRatio: number) => {
        let p = standOn(unitRatio, { velocity: new Vector3(0, 0, -4 / unitRatio), vy: 0 });
        const w = worldOf(unitRatio, abyss());
        for (let i = 0; i < 60; i++) p = stepWalk(p, go({}), w);
        return -p.position.z * unitRatio;
      };
      expect(metres(0.1)).toBeCloseTo(metres(1), 6);
      expect(metres(1)).toBeCloseTo((4 * (1 - Math.exp(-AIR_DRAG))) / AIR_DRAG, 1);
    });
  });

  it("eases into the walk speed on the ground in about 80 ms, and at once under reduced motion", () => {
    const eased = (dt: number) =>
      stepWalk(
        standOn(),
        go({ forward: 1, instant: false }),
        worldOf(1, () => 0, dt),
      ).velocity.length();
    expect(eased(0.08)).toBeCloseTo(1.4 * (1 - Math.exp(-1)), 5);
    expect(eased(0.25)).toBeGreaterThan(0.95 * 1.4);
    expect(
      stepWalk(
        standOn(),
        go({ forward: 1 }),
        worldOf(1, () => 0, 0.01),
      ).velocity.length(),
    ).toBeCloseTo(1.4);
  });

  it("comes to rest in about 80 ms once the keys are up, eased", () => {
    const w = worldOf(1, () => 0, 0.08);
    const moving = standOn(1, { velocity: new Vector3(0, 0, -1.4) });
    expect(stepWalk(moving, go({ instant: false }), w).velocity.length()).toBeCloseTo(1.4 * Math.exp(-1), 5);
    let p = moving;
    for (let i = 0; i < 7; i++) p = stepWalk(p, go({ instant: false }), w); // 0.56 s
    expect(p.velocity.lengthSq()).toBe(0);
  });

  it("sticks to ground up to a step lower, at once", () => {
    const p = stepWalk(
      standOn(),
      go({}),
      worldOf(1, () => -0.45),
    );
    expect(feetOf(p)).toBeCloseTo(-0.45);
    expect(p.vy).toBeUndefined();
  });

  it("falls from rest off a drop deeper than a step", () => {
    const p = stepWalk(
      standOn(),
      go({}),
      worldOf(1, () => -0.6, 0.1),
    );
    expect(p.vy).toBeCloseTo(-0.98);
    expect(feetOf(p)).toBeCloseTo(-0.049);
  });
});

describe("walking into real meshes", () => {
  // 1 scene unit = 1 m. A 10×1×10 slab whose top — the ground — is at y = 0.
  const scale = walkScale(1);
  const site = (...on: Object3D[]) => {
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
    // Its floor is the slab: the ray down from the knee over the feet found it, inside.
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

  it("never walks through a block taller than a step, under the knee or over it", () => {
    // The ray down from the knee starts above these; before, one from a step up found the floor inside them.
    for (const h of [0.55, 0.65, 1.05, 1.15]) {
      const p = walkNorth(site(block(h, 4, -1.05)));
      expect(p.z).toBeGreaterThan(-1.05);
      expect(p.y).toBeCloseTo(scale.eye);
    }
  });

  /** A placed object as PlacementInstance draws one: a unit box scaled by its group to 4 × h × 4, on the ground, its +Z face at z = `face`. */
  const placed = (height: number, face: number) => {
    const g = new Group();
    g.add(new Mesh(new BoxGeometry(1, 1, 1)));
    g.scale.set(4, height, 4);
    g.position.set(0, height / 2, face - 2);
    return g;
  };
  /** `frames` frames of `dt` with `input` held, from standing at (0, `z0`). */
  const walkFor = (scene: Object3D, input: FreeInput, frames: number, dt: number, z0 = 0) => {
    const w: WalkWorld = {
      dt,
      speed: walkSpeed(1, 1),
      scale,
      groundAt: (x, z, fromY) => raycastSurfaceY(scene, x, z, fromY),
      wallAt: (from, dir, reach) => hitsWithin(scene, from, dir, reach),
    };
    let pose: FreePose = {
      position: new Vector3(0, scale.eye, z0),
      yaw: 0,
      pitch: 0,
      velocity: new Vector3(),
      ground: 0,
    };
    for (let i = 0; i < frames; i++) pose = stepWalk(pose, input, w);
    return pose;
  };

  it("stops at a placed object's wall as at the territory's", () => {
    expect(walkNorth(site(placed(2, -1.05))).z).toBeCloseTo(-0.7);
  });

  it("jumps onto a 0.9 m crate, and not onto a 1.2 m one", () => {
    const onto = walkFor(site(placed(0.9, -1.05)), go({ forward: 1, jump: true }), 120, 1 / 60);
    expect(onto.ground).toBeCloseTo(0.9);
    expect(onto.position.z).toBeLessThan(-1.05);
    const short = walkFor(site(placed(1.2, -1.05)), go({ forward: 1, jump: true }), 120, 1 / 60);
    expect(short.ground).toBeCloseTo(0);
    expect(short.position.z).toBeGreaterThan(-1.05);
  });

  it("jumps onto a 0.95 m crate, just under what a jump's 0.5 m and a step reach", () => {
    const onto = walkFor(site(placed(0.95, -1.05)), go({ forward: 1, jump: true }), 120, 1 / 60);
    expect(onto.ground).toBeCloseTo(0.95);
    expect(onto.position.z).toBeLessThan(-1.05);
  });

  it("neither enters nor stands on a 1.05 m crate, jumping or not", () => {
    for (const jump of [true, false]) {
      const p = walkFor(site(placed(1.05, -1.05)), go({ forward: 1, jump }), 120, 1 / 60);
      expect(p.ground).toBeCloseTo(0);
      expect(p.position.z).toBeGreaterThan(-1.05);
    }
  });

  it("never walks through a 2 cm rail that the knee passes over, running at 0.1 s a frame from any start", () => {
    for (const h of [0.55, 0.62, 0.69]) {
      for (const z0 of [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]) {
        const p = walkFor(site(block(h, 0.02, -1.05)), go({ forward: 1, boost: true }), 30, 0.1, z0);
        // Stops at the near face, or a float short of it: a step can land exactly on the face.
        expect(p.position.z, `rail ${h} m from z ${z0}`).toBeGreaterThan(-1.05 - 1e-6);
      }
    }
  });

  /** A ramp rising towards -z from the floor's edge at z = 0, its top at `deg`. */
  const ramp = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    const m = new Mesh(new BoxGeometry(4, 0.01, 20));
    m.rotation.x = a;
    m.position.set(0, 10 * Math.sin(a) - 0.005 * Math.cos(a), -10 * Math.cos(a) - 0.005 * Math.sin(a));
    return m;
  };
  /** Ten treads of `rise` by `tread`, from z = -1 towards -z. */
  const stairs = (rise: number, tread: number) => {
    const g = new Group();
    for (let i = 1; i <= 10; i++) {
      const m = new Mesh(new BoxGeometry(4, rise * i, tread));
      m.position.set(0, (rise * i) / 2, -1 - tread * (i - 0.5));
      g.add(m);
    }
    return g;
  };

  it("walks up ramps of 20, 30 and 40 degrees and stairs of 18/28 and 20/25 cm, walking and running", () => {
    const climbs = [() => ramp(20), () => ramp(30), () => ramp(40), () => stairs(0.18, 0.28), () => stairs(0.2, 0.25)];
    for (const [input, frames, dt] of [
      [go({ forward: 1 }), 240, 1 / 60],
      [go({ forward: 1, boost: true }), 30, 0.1],
    ] as const) {
      for (const climb of climbs) {
        expect(walkFor(site(climb()), input, frames, dt).position.z).toBeLessThan(-1.5);
      }
    }
  });

  const easy = (over: Partial<FreeInput>) => go({ ...over, instant: false });
  /** Each `[input, frames]` leg in turn at `dt`, from standing at the origin. */
  const legs = (scene: Object3D, dt: number, ...run: Array<[FreeInput, number]>) => {
    const w: WalkWorld = {
      dt,
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
    for (const [input, frames] of run) for (let i = 0; i < frames; i++) pose = stepWalk(pose, input, w);
    return pose;
  };

  it("eased: walks up to a 0.9 m crate and jumps onto it, and neither onto nor into a 1.05 m one", () => {
    // 1 s up to the crate (the wall probe holds it off, the velocity still the wish), then Space with W held.
    const up = (h: number) =>
      legs(site(placed(h, -1.05)), 1 / 60, [easy({ forward: 1 }), 60], [easy({ forward: 1, jump: true }), 120]);
    expect(up(0.9).ground).toBeCloseTo(0.9);
    expect(up(0.9).position.z).toBeLessThan(-1.05);
    expect(up(1.05).ground).toBeCloseTo(0);
    expect(up(1.05).position.z).toBeGreaterThan(-1.05);
  });

  it("eased: never walks through a 2 cm rail the knee passes over, running at 0.1 s a frame from any start", () => {
    for (const h of [0.55, 0.62, 0.69]) {
      for (const z0 of [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]) {
        const p = walkFor(site(block(h, 0.02, -1.05)), easy({ forward: 1, boost: true }), 30, 0.1, z0);
        expect(p.position.z, `rail ${h} m from z ${z0}`).toBeGreaterThan(-1.05 - 1e-6);
      }
    }
  });

  it("eased: stops short of a building and climbs ramps and stairs, walking and running", () => {
    expect(walkFor(site(block(6, 4, -1.05)), easy({ forward: 1 }), 120, 1 / 60).position.z).toBeGreaterThan(
      -1.05 + scale.body - 1e-6,
    );
    const climbs = [() => ramp(20), () => ramp(30), () => ramp(40), () => stairs(0.18, 0.28), () => stairs(0.2, 0.25)];
    for (const [input, frames, dt] of [
      [easy({ forward: 1 }), 240, 1 / 60],
      [easy({ forward: 1, boost: true }), 30, 0.1],
    ] as const) {
      for (const climb of climbs) expect(walkFor(site(climb()), input, frames, dt).position.z).toBeLessThan(-1.5);
    }
  });
});
