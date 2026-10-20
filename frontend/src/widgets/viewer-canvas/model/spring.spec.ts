import { describe, expect, it } from "vitest";
import { AT_REST, kickFor, springTo, type Spring } from "./spring";

/** `n` frames of `dt` from `s` towards `target`. */
const run = (s: Spring, n: number, dt: number, omega: number, zeta: number, target = 0) => {
  let at = s;
  for (let i = 0; i < n; i++) at = springTo(at, target, omega, zeta, dt);
  return at;
};

/** The lowest point a spring reaches over `n` frames of `dt`, and the frame it is reached on. */
const lowest = (s: Spring, n: number, dt: number, omega: number, zeta: number) => {
  let at = s;
  let min = { x: s.x, i: 0 };
  for (let i = 1; i <= n; i++) {
    at = springTo(at, 0, omega, zeta, dt);
    if (at.x < min.x) min = { x: at.x, i };
  }
  return min;
};

describe("springTo", () => {
  it("lands one frame of 0.1 s where a hundred frames of 1 ms land", () => {
    for (const zeta of [1, 0.6]) {
      const one = springTo({ x: 1, v: -2 }, 0, 20, zeta, 0.1);
      const many = run({ x: 1, v: -2 }, 100, 0.001, 20, zeta);
      expect(one.x).toBeCloseTo(many.x, 9);
      expect(one.v).toBeCloseTo(many.v, 9);
    }
  });

  it("critically damped: never crosses rest, and is 95 % home at ωt ≈ 4.74", () => {
    let s: Spring = { x: 1, v: 0 };
    for (let i = 0; i < 500; i++) {
      s = springTo(s, 0, 40, 1, 0.001);
      expect(s.x).toBeGreaterThan(0);
    }
    expect(springTo({ x: 1, v: 0 }, 0, 40, 1, 4.74 / 40).x).toBeCloseTo(0.05, 3);
  });

  it("at ζ 0.6 swings past rest by about 9.5 %", () => {
    expect(lowest({ x: 1, v: 0 }, 1000, 0.001, 20, 0.6).x).toBeCloseTo(-Math.exp((-Math.PI * 0.6) / 0.8), 3);
  });

  it("never grows on a long frame: 0.1 s, 1 s, 10 s", () => {
    for (const zeta of [1, 0.6]) {
      for (const dt of [0.1, 1, 10]) {
        expect(Math.abs(springTo({ x: 1, v: 0 }, 0, 20, zeta, dt).x)).toBeLessThanOrEqual(1);
      }
      expect(springTo({ x: 1, v: 5 }, 0, 20, zeta, 10).x).toBeCloseTo(0, 9);
    }
  });

  it("is pulled towards its target", () => {
    expect(run(AT_REST, 2000, 0.001, 10, 1, 3).x).toBeCloseTo(3, 3);
  });

  it("stands still on a frame that is not a number, or not a frame", () => {
    const s = { x: 1, v: 1 };
    expect(springTo(s, 0, 20, 1, Number.NaN)).toBe(s);
    expect(springTo(s, 0, 20, 0.6, 0)).toBe(s);
  });
});

describe("kickFor", () => {
  it.each([1, 0.6])("a kick from rest carries it the depth asked (ζ %s)", (zeta) => {
    expect(lowest({ x: 0, v: kickFor(-0.07, 20, zeta) }, 1000, 0.0005, 20, zeta).x).toBeCloseTo(-0.07, 4);
  });

  it("turns about 58 ms after the kick at ω 20, ζ 0.6", () => {
    const { i } = lowest({ x: 0, v: kickFor(-0.035, 20, 0.6) }, 1000, 0.0005, 20, 0.6);
    expect(i * 0.0005).toBeCloseTo(0.058, 2);
  });
});
