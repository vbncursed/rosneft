import { describe, expect, it } from "vitest";
import { controlClass } from "./control-class";

describe("controlClass", () => {
  it("defaults to the sans face on the neutral ground", () => {
    const cls = controlClass();
    expect(cls).toContain("font-sans");
    expect(cls).toContain("border-line-2");
    expect(cls).toContain("bg-panel-2");
  });

  it("switches to mono for slugs and hashes", () => {
    const cls = controlClass({ mono: true });
    expect(cls).toContain("font-mono");
    expect(cls).not.toContain("font-sans");
  });

  it("swaps the ground and border when invalid", () => {
    const cls = controlClass({ invalid: true });
    expect(cls).toContain("border-bad");
    expect(cls).toContain("bg-bad-soft");
    expect(cls).not.toContain("border-line-2");
  });

  it("drops the top gap when a wrapper already carries it", () => {
    expect(controlClass()).toContain("mt-[7px]");
    expect(controlClass({ spaced: false })).not.toContain("mt-[7px]");
  });

  it("keeps a focus ring in every combination", () => {
    for (const opts of [{}, { mono: true }, { invalid: true }, { spaced: false }]) {
      expect(controlClass(opts)).toContain("focus:ring-[3px]");
    }
  });

  it("appends the caller's own classes last", () => {
    expect(controlClass({ className: "pr-10" })).toContain("pr-10");
  });
});
