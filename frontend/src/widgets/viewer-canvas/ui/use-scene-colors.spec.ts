import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTheme } from "@/features/theme-toggle";
import { readSceneColors } from "../model/scene-colors";
import { useSceneColors } from "./use-scene-colors";

const setPanel = (panel: string) => {
  document.documentElement.style.setProperty("--panel", panel);
  document.documentElement.style.setProperty("--line", "#282c31");
  document.documentElement.style.setProperty("--accent", "#f97316");
};

beforeEach(() => setPanel("#16181b"));

describe("useSceneColors", () => {
  it("starts from the colours the tokens hold on <html>", () => {
    const { result } = renderHook(() => useSceneColors());
    expect(result.current).toEqual(readSceneColors(document.documentElement));
  });

  it("re-reads them when the theme flips", () => {
    const { result } = renderHook(() => useSceneColors());
    const elsewhere = renderHook(() => useTheme());

    setPanel("#ffffff");
    act(() => elsewhere.result.current.toggle());

    expect(result.current.background).toBe("#ffffff");
  });
});
