import { describe, expect, it } from "vitest";
import { stageLabel } from "./stage-label";

describe("stageLabel", () => {
  it("humanises every worker token the gateway documents", () => {
    expect(stageLabel("fetching")).toBe("Fetching source");
    expect(stageLabel("extracting")).toBe("Extracting archive");
    expect(stageLabel("parsing")).toBe("Parsing OBJ + MTL");
    expect(stageLabel("encoding")).toBe("Encoding geometry");
    expect(stageLabel("compressing")).toBe("Compressing textures");
    expect(stageLabel("registering")).toBe("Registering artifacts");
  });

  it("numbers a lod-N token", () => {
    expect(stageLabel("lod-0")).toBe("Building LOD 0");
    expect(stageLabel("lod-1")).toBe("Building LOD 1");
    expect(stageLabel("lod-2")).toBe("Building LOD 2");
  });

  it("reads a null token as queued, not converting", () => {
    expect(stageLabel(null)).toBe("Queued");
  });

  it("falls back to the token itself for anything unrecognised", () => {
    expect(stageLabel("mystery-phase")).toBe("mystery-phase");
  });
});
