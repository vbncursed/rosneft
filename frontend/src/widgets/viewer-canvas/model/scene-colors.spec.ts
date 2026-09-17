import { describe, expect, it } from "vitest";
import { readSceneColors } from "./scene-colors";

describe("readSceneColors", () => {
  it("reads the tokens off the root", () => {
    const root = document.createElement("div");
    root.style.setProperty("--panel", "#ffffff");
    root.style.setProperty("--line", "#e3e1db");
    root.style.setProperty("--accent", "#e5610a");
    document.body.append(root);
    expect(readSceneColors(root)).toEqual({
      background: "#ffffff",
      grid: "#e3e1db",
      accent: "#e5610a",
    });
    root.remove();
  });

  it("falls back to the dark theme when the tokens are unset", () => {
    expect(readSceneColors(document.createElement("div"))).toEqual({
      background: "#16181b",
      grid: "#282c31",
      accent: "#f97316",
    });
  });
});
