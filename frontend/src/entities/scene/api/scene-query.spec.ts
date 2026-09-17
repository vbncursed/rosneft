import { describe, expect, it } from "vitest";
import { sceneQuery } from "./scene-query";

describe("sceneQuery", () => {
  it("keys on the slug", () => {
    expect(sceneQuery("north").queryKey).toEqual(["scene", "north"]);
  });
});
