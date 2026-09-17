import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it } from "vitest";
import Lighting from "./lighting";

describe("Lighting", () => {
  it("lights the scene with one ambient and two directional lights", async () => {
    const r = await ReactThreeTestRenderer.create(<Lighting />);
    expect(r.scene.findAll((n) => n.instance.type === "AmbientLight")).toHaveLength(1);
    expect(r.scene.findAll((n) => n.instance.type === "DirectionalLight")).toHaveLength(2);
  });
});
