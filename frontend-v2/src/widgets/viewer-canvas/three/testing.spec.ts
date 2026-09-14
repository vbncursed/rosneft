import { describe, expect, it } from "vitest";
import { boundsStub, fakeControls, fakePlacement, fakeScene, mockDrei } from "./testing";

describe("the drei test doubles", () => {
  it("builds a parsable scene and a one-level placement", () => {
    expect(fakeScene().children).toHaveLength(1);
    expect(fakePlacement(3).chain[0].hash).toBe("h3");
    expect(fakePlacement(3).position.x).toBe(3);
  });

  it("replaces the network- and DOM-bound pieces and keeps the rest", async () => {
    const drei = await mockDrei(async () => ({ Grid: "kept", useGLTF: "real" }));
    expect((drei as unknown as Record<string, unknown>).Grid).toBe("kept");
    expect(drei.useGLTF()).toEqual({ scene: expect.anything() });
    expect(drei.useGLTF.preload).toBeTypeOf("function");
    expect(drei.useBounds()).toBe(boundsStub);
  });

  it("fires a controls listener until it is removed again", () => {
    const controls = fakeControls();
    let fired = 0;
    const listener = () => (fired += 1);
    controls.addEventListener("change", listener);
    controls.fire("change");
    controls.fire("other");
    expect(fired).toBe(1);

    controls.removeEventListener("change", listener);
    controls.fire("change");
    expect(fired).toBe(1);
  });
});
