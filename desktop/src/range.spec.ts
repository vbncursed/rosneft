import { describe, expect, it } from "vitest";
import { parseRange } from "./range";

describe("parseRange", () => {
  it("is null without a header", () => expect(parseRange(null, 100)).toBeNull());
  it("reads a closed range", () => expect(parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 }));
  it("reads an open range", () => expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 }));
  it("reads a suffix range", () => expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 }));
  it("clamps an end past the file", () => expect(parseRange("bytes=95-500", 100)).toEqual({ start: 95, end: 99 }));
  it("refuses a start past the file", () => expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable"));
  it("refuses an empty suffix", () => expect(parseRange("bytes=-0", 100)).toBe("unsatisfiable"));
  it("serves a multi-range or malformed header whole", () => {
    expect(parseRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseRange("items=0-1", 100)).toBeNull();
  });
});
