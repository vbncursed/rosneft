import { describe, expect, it } from "vitest";
import { labelFor } from "./refs";

describe("refs", () => {
  it("names an id the page could name, and nothing else", () => {
    const refs = { "role_id:9b75ebfc-1": "Editor" };
    expect(labelFor(refs, "role_id", "9b75ebfc-1")).toBe("Editor");
    expect(labelFor(refs, "role_id", "unknown")).toBeNull();
    expect(labelFor(refs, "role_id", { nested: true })).toBeNull();
  });
});
