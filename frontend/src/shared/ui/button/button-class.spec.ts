import { describe, expect, it } from "vitest";
import { buttonClass } from "./button-class";

describe("buttonClass", () => {
  it("dresses a secondary control by default", () => {
    const cls = buttonClass({ variant: "secondary" });
    expect(cls).toContain("border-line-2");
    expect(cls).toContain("bg-panel-2");
    expect(cls).toContain("relative");
  });

  it("changes ground and border with the variant", () => {
    expect(buttonClass({ variant: "primary" })).toContain("bg-accent");
  });
});
