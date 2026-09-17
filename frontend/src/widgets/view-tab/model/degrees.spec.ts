import { describe, expect, it } from "vitest";
import { degToRad, printDegrees, radToDeg } from "./degrees";

describe("radToDeg", () => {
  it("converts a quarter turn", () => {
    expect(radToDeg(Math.PI / 2)).toBeCloseTo(90, 10);
  });

  it("reports a negative angle as its bearing, not as a negative", () => {
    expect(radToDeg(-Math.PI / 2)).toBeCloseTo(270, 10);
  });

  it("keeps a bearing inside one turn however many turns it was given", () => {
    expect(radToDeg(-3 * Math.PI)).toBeCloseTo(180, 10);
    expect(radToDeg(5 * Math.PI)).toBeCloseTo(180, 10);
  });
});

describe("degToRad", () => {
  it("round-trips every quarter", () => {
    for (const deg of [0, 45, 90, 137.5, 180, 359.5]) {
      expect(radToDeg(degToRad(deg))).toBeCloseTo(deg, 10);
    }
  });
});

describe("printDegrees", () => {
  it("prints one decimal and the degree sign", () => {
    expect(printDegrees(Math.PI / 2)).toBe("90.0°");
    expect(printDegrees(0)).toBe("0.0°");
  });

  it("prints the mock's yaw", () => {
    expect(printDegrees(degToRad(137.5))).toBe("137.5°");
  });

  it("prints a negative angle as its bearing", () => {
    expect(printDegrees(-Math.PI / 2)).toBe("270.0°");
  });
});
