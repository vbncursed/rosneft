import { Object3D, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { holdStill, stopCoast } from "./stop-coast";

describe("stopCoast", () => {
  // With damping off, OrbitControls.update() applies the whole leftover delta
  // and zeroes it; with damping on it would only apply a fraction and coast on.
  it("spends the leftover inertia in one undamped update, then puts damping back", () => {
    const seen: boolean[] = [];
    const controls = {
      enableDamping: true,
      update() {
        seen.push(this.enableDamping);
      },
    };
    stopCoast(controls);
    expect(seen).toEqual([false]);
    expect(controls.enableDamping).toBe(true);
  });

  it("leaves damping off where it was off", () => {
    const controls = { enableDamping: false, update() {} };
    stopCoast(controls);
    expect(controls.enableDamping).toBe(false);
  });

  // A grab right after a flick: spending the leftover in one step moved the
  // camera by all of it in a single frame. The grab zeroes it in place.
  it("holdStill drops the leftover without moving the camera or its target", () => {
    const object = new Object3D();
    object.position.set(1, 2, 3);
    object.lookAt(0, 0, 0);
    const target = new Vector3(0, 0, 0);
    const controls = {
      enableDamping: true,
      target,
      // The undamped update applies the whole leftover: a jump.
      update() {
        object.position.x += 5;
        object.rotateY(1);
        target.x += 5;
      },
    };
    const before = { pos: object.position.clone(), quat: object.quaternion.clone(), target: target.clone() };
    holdStill(controls, object);
    expect(object.position.toArray()).toEqual(before.pos.toArray());
    expect(object.quaternion.toArray()).toEqual(before.quat.toArray());
    expect(target.toArray()).toEqual(before.target.toArray());
    expect(controls.enableDamping).toBe(true);
  });
});
