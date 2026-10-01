import { describe, expect, it } from "vitest";
import { DEFAULT_UPSTREAM, upstreamOrigin } from "./config";

describe("upstreamOrigin", () => {
  it("is production when nothing overrides it", () => {
    expect(upstreamOrigin({})).toBe(DEFAULT_UPSTREAM);
  });
  it("takes DESKTOP_UPSTREAM and keeps only its origin", () => {
    expect(upstreamOrigin({ DESKTOP_UPSTREAM: "http://localhost:3000/territories" })).toBe("http://localhost:3000");
  });
  it("ignores an empty override", () => {
    expect(upstreamOrigin({ DESKTOP_UPSTREAM: "" })).toBe(DEFAULT_UPSTREAM);
  });
  it("refuses anything that is not http(s)", () => {
    expect(() => upstreamOrigin({ DESKTOP_UPSTREAM: "file:///etc" })).toThrow(/http\(s\)/);
  });
  it("refuses garbage", () => {
    expect(() => upstreamOrigin({ DESKTOP_UPSTREAM: "not a url" })).toThrow();
  });
});
