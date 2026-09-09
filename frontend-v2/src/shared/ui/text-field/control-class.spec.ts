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
    // Same line-height in both faces: a PasswordField toggles mono on reveal
    // and the input must not change height under the eye button.
    expect(cls).toContain("leading-5");
  });

  // Same font *size* too, not just line-height — a PasswordField that reveals
  // on Generate switches only the mono flag, so two fields side by side
  // (current + new password) must not visibly change size the instant one
  // is revealed.
  it("keeps the same text size in both faces — only the family changes", () => {
    expect(controlClass({ mono: true })).toContain("text-sm");
    expect(controlClass({ mono: false })).toContain("text-sm");
    expect(controlClass({ mono: true })).not.toContain("text-[13px]");
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
