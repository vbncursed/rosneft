import { describe, expect, it } from "vitest";
import { linkButtonClass } from "./link-class";

const classesOf = (variant: "primary" | "secondary") => linkButtonClass(variant).split(/\s+/);

describe("linkButtonClass", () => {
  it("gives both variants the same frame, focus ring and hit area", () => {
    for (const variant of ["primary", "secondary"] as const) {
      const classes = classesOf(variant);
      expect(classes).toContain("rounded-control");
      expect(classes).toContain("no-underline");
      expect(classes).toContain("focus-visible:outline-accent");
    }
  });

  it("fills the primary with the accent and its own foreground", () => {
    const classes = classesOf("primary");
    expect(classes).toContain("bg-accent");
    expect(classes).toContain("text-accent-fg");
  });

  it("gives the secondary the raised ground and the line border", () => {
    const classes = classesOf("secondary");
    expect(classes).toContain("bg-panel-2");
    expect(classes).toContain("border-line-2");
  });

  // clsx concatenates; two utilities for one property are resolved by the
  // compiled stylesheet's source order, not the string's. So each of the three
  // coloured properties may be declared exactly once per variant.
  it("declares each coloured property exactly once — clsx merges nothing", () => {
    for (const variant of ["primary", "secondary"] as const) {
      const classes = classesOf(variant).filter((c) => !c.includes(":"));
      expect(classes.filter((c) => c.startsWith("bg-"))).toHaveLength(1);
      expect(classes.filter((c) => /^text-[a-z]/.test(c))).toHaveLength(1);
      expect(classes.filter((c) => /^border-[a-z]/.test(c))).toHaveLength(1);
    }
  });
});
