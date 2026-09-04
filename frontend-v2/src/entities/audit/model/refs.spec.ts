import { describe, expect, it } from "vitest";
import { labelFor, shortId } from "./refs";

describe("refs", () => {
  it("names an id the page could name, and nothing else", () => {
    const refs = { "role_id:9b75ebfc-1": "Editor" };
    expect(labelFor(refs, "role_id", "9b75ebfc-1")).toBe("Editor");
    expect(labelFor(refs, "role_id", "unknown")).toBeNull();
    expect(labelFor(refs, "role_id", { nested: true })).toBeNull();
  });

  it("shortens long ids and leaves short ones alone", () => {
    expect(shortId("9b75ebfc-1234-5678-9abc-def012345678")).toBe("9b75ebfc");
    expect(shortId(42)).toBe("42");
  });
});
