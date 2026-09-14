import { describe, expect, it } from "vitest";
import { readout, readoutLabel } from "./metric";

describe("readout", () => {
  it("prints the value once there is one", () => {
    expect(readout({ kind: "value", value: "142" })).toBe("142");
  });

  it("uses distinct glyphs for waiting and for failing", () => {
    expect(readout({ kind: "loading" })).toBe("…");
    expect(readout({ kind: "unavailable" })).toBe("—");
  });
});

describe("readoutLabel", () => {
  it("spells out what the glyphs mean, so colour is not the only signal", () => {
    expect(readoutLabel("Req/s", { kind: "loading" })).toBe("Req/s: loading");
    expect(readoutLabel("Error rate", { kind: "unavailable" })).toBe("Error rate: unavailable");
    expect(readoutLabel("Sessions", { kind: "value", value: "37" })).toBe("Sessions: 37");
  });
});
