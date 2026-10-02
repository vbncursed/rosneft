import { describe, expect, it } from "vitest";
import { openableExternally, sameOrigin } from "./links";

const ORIGIN = "https://andrey.vbncursed.fun";

describe("sameOrigin", () => {
  it("matches a path on the upstream", () => expect(sameOrigin(`${ORIGIN}/territories`, ORIGIN)).toBe(true));
  it("rejects a look-alike host", () =>
    expect(sameOrigin("https://andrey.vbncursed.fun.evil.io/", ORIGIN)).toBe(false));
  it("rejects another scheme", () => expect(sameOrigin("http://andrey.vbncursed.fun/", ORIGIN)).toBe(false));
  it("rejects garbage", () => expect(sameOrigin("::", ORIGIN)).toBe(false));
});

describe("openableExternally", () => {
  it("opens https", () => expect(openableExternally("https://example.com")).toBe(true));
  it("opens mailto", () => expect(openableExternally("mailto:a@b.c")).toBe(true));
  it("never opens file, javascript or custom schemes", () => {
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "smb://host/share", "http://example.com"]) {
      expect(openableExternally(url)).toBe(false);
    }
  });
});
