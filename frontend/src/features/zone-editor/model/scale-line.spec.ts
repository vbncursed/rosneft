import { describe, expect, it } from "vitest";
import { scaleLine } from "./scale-line";

describe("scaleLine", () => {
  it("says how much larger the model is, in words", () => {
    expect(scaleLine(0.012)).toEqual({ text: "Model is 1.2 % larger than the drawing", warn: false });
  });

  it("says smaller for a negative difference", () => {
    expect(scaleLine(-0.02)).toEqual({ text: "Model is 2.0 % smaller than the drawing", warn: false });
  });

  it("warns, in words, above 3 %", () => {
    const line = scaleLine(0.04);
    expect(line.warn).toBe(true);
    expect(line.text).toBe("Model is 4.0 % larger than the drawing. Check that the points match.");
  });

  it("does not warn at exactly 3 %", () => {
    expect(scaleLine(0.03).warn).toBe(false);
  });

  it("reports a match when the difference prints as 0.0 %", () => {
    expect(scaleLine(0.0003)).toEqual({ text: "Model matches the drawing scale", warn: false });
  });
});
