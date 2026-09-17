import { describe, expect, it } from "vitest";

// props.ts is the widget's contract and holds only types, so there is nothing
// to exercise but the fact that the module loads — a stray runtime import or a
// circular one would fail here rather than at the first page that uses it.
describe("the viewer canvas contract", () => {
  it("is types only — the module carries no runtime shape", async () => {
    expect(Object.keys(await import("./props"))).toEqual([]);
  });
});
