import { describe, expect, it } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  it("takes the first letter of the first two parts", () => {
    expect(initials("a.ivanova")).toBe("AI");
    expect(initials("Dmitry Smirnov")).toBe("DS");
    expect(initials("guest_viewer")).toBe("GV");
    expect(initials("old-account")).toBe("OA");
  });

  it("uses only the first two parts of a longer name", () => {
    expect(initials("Anna Maria Ivanova")).toBe("AM");
  });

  it("falls back to the first two letters of a single word", () => {
    expect(initials("root")).toBe("RO");
    expect(initials("x")).toBe("X");
  });

  it("survives an empty or punctuation-only name", () => {
    expect(initials("")).toBe("?");
    expect(initials("...")).toBe("?");
    expect(initials("   ")).toBe("?");
  });

  it("upper-cases whatever it finds", () => {
    expect(initials("ann.smith")).toBe("AS");
  });
});
