import { describe, expect, it } from "vitest";
import { UNGROUPED_TAG_SLUG } from "./model-tag";

describe("UNGROUPED_TAG_SLUG", () => {
  it("is the slug the gateway gives the catch-all tag", () => {
    expect(UNGROUPED_TAG_SLUG).toBe("ungrouped");
  });
});
