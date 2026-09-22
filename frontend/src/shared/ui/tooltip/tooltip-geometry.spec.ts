import { describe, expect, it } from "vitest";
import { EDGE, GAP, placeTooltip } from "./tooltip-geometry";

const vp = { width: 1000, height: 800 };
const tip = { width: 100, height: 24 };
const at = (top: number, left: number) => ({ top, left, width: 30, height: 30 });

describe("placeTooltip", () => {
  it("sits above the trigger, centred, by default", () => {
    expect(placeTooltip(at(400, 500), tip, vp, "top")).toEqual({ top: 400 - GAP - 24, left: 515 - 50, side: "top" });
  });
  it("sits below when asked", () => {
    expect(placeTooltip(at(400, 500), tip, vp, "bottom")).toEqual({ top: 430 + GAP, left: 465, side: "bottom" });
  });
  it("flips below when there is no room above", () => {
    expect(placeTooltip(at(10, 500), tip, vp, "top")).toMatchObject({ top: 40 + GAP, side: "bottom" });
  });
  it("flips above when there is no room below", () => {
    expect(placeTooltip(at(760, 500), tip, vp, "bottom")).toMatchObject({ top: 760 - GAP - 24, side: "top" });
  });
  it("keeps the asked side when neither fits", () => {
    const tall = { width: 100, height: 900 };
    expect(placeTooltip(at(400, 500), tall, vp, "bottom").side).toBe("bottom");
    expect(placeTooltip(at(400, 500), tall, vp, "top").side).toBe("top");
  });
  it("clamps to the left and right edges", () => {
    expect(placeTooltip(at(400, 0), tip, vp, "top").left).toBe(EDGE);
    expect(placeTooltip(at(400, 990), tip, vp, "top").left).toBe(1000 - EDGE - 100);
  });
});
