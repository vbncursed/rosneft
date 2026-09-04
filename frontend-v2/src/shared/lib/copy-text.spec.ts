import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText } from "./copy-text";

afterEach(() => vi.unstubAllGlobals());

describe("copyText", () => {
  it("resolves true when the clipboard accepts", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyText("x")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("x");
  });
  it("resolves false when the clipboard refuses", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
    await expect(copyText("x")).resolves.toBe(false);
  });
  it("resolves false when there is no clipboard at all", async () => {
    vi.stubGlobal("navigator", {});
    await expect(copyText("x")).resolves.toBe(false);
  });
});
