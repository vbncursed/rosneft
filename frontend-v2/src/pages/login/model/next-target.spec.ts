import { describe, expect, it } from "vitest";
import { nextTarget } from "./next-target";

describe("nextTarget", () => {
  it("accepts a same-origin path, search preserved", () => {
    expect(nextTarget("/console/audit?actor=x")).toBe("/console/audit?actor=x");
  });

  it("rejects a protocol-relative URL", () => {
    expect(nextTarget("//evil.com")).toBe("/");
  });

  // Browsers normalise a backslash to a forward slash in the authority
  // position, so this is protocol-relative too.
  it("rejects a backslash-authority URL", () => {
    expect(nextTarget("/\\evil.com")).toBe("/");
  });

  it("rejects an absolute URL", () => {
    expect(nextTarget("https://evil.com")).toBe("/");
  });

  it("rejects a relative path that could escape upward", () => {
    expect(nextTarget("../escape")).toBe("/");
  });

  it("falls back when absent", () => {
    expect(nextTarget(undefined)).toBe("/");
  });
});
