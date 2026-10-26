import { describe, expect, it } from "vitest";
import { toModelTag } from "./to-model-tag";

describe("toModelTag", () => {
  it("keeps the slug and the title", () => {
    expect(toModelTag({ slug: "tanks", title: "Tanks" })).toEqual({ slug: "tanks", title: "Tanks" });
  });

  it("reads a pre-release snapshot without a tag as ungrouped", () => {
    expect(toModelTag(undefined as never)).toEqual({ slug: "ungrouped", title: "Ungrouped" });
  });
});
