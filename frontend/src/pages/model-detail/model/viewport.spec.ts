import { describe, expect, it } from "vitest";
import type { Artifact } from "@/entities/content";
import { IDLE_REPORT, viewportState } from "./viewport";

const artifact = (lod: number, hash: string): Artifact => ({
  lod,
  hash,
  size: 1,
  vertices: 1,
  faces: 1,
  bboxMin: { x: 0, y: 0, z: 0 },
  bboxMax: { x: 1, y: 1, z: 1 },
});

const LODS = [artifact(0, "h0"), artifact(2, "h2")];
const base = { slug: "tanker", status: "ready" as const, artifacts: LODS, report: IDLE_REPORT, unavailable: false };

describe("viewportState", () => {
  it("shows the unavailable message even when artifacts exist", () => {
    expect(viewportState({ ...base, unavailable: true })).toEqual({
      kind: "message",
      message: expect.objectContaining({ title: "3D preview unavailable" }),
    });
  });

  it.each([
    ["converting", "Converting"],
    ["failed", "Conversion failed"],
    ["pending", "Not converted yet"],
    ["ready", "Not converted yet"],
  ] as const)("shows the %s status message without artifacts", (status, title) => {
    expect(viewportState({ ...base, artifacts: [], status })).toEqual({
      kind: "message",
      message: expect.objectContaining({ title }),
    });
  });

  it("is loading while nothing has been shown yet", () => {
    expect(viewportState(base)).toEqual({ kind: "canvas", loading: true, upgrade: null, failure: null });
  });

  it("names the upgrade while a finer level streams behind the one on screen", () => {
    const report = { shown: 2, target: 0, percent: 62, progressText: "6.1 / 9.8 MB", failure: null };
    expect(viewportState({ ...base, report })).toEqual({
      kind: "canvas",
      loading: false,
      upgrade: "LOD 2 → 0 · 6.1 / 9.8 MB",
      failure: null,
    });
  });

  it("names no upgrade once the target is on screen", () => {
    const report = { shown: 0, target: 0, percent: null, progressText: null, failure: null };
    expect(viewportState({ ...base, report })).toMatchObject({ loading: false, upgrade: null });
  });

  it("reports the failed level's file when nothing is on screen", () => {
    const report = { shown: null, target: 2, percent: null, progressText: null, failure: { hash: "h2", status: 502 } };
    expect(viewportState({ ...base, report })).toEqual({
      kind: "canvas",
      loading: false,
      upgrade: null,
      failure: { file: "tanker-lod2.glb", status: 502 },
    });
  });

  it("falls back to the target's file when the failure hash is unknown", () => {
    const report = {
      shown: null,
      target: 2,
      percent: null,
      progressText: null,
      failure: { hash: "zzz", status: null },
    };
    expect(viewportState({ ...base, report })).toMatchObject({ failure: { file: "tanker-lod2.glb", status: null } });
  });
});
