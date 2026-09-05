import { describe, expect, it } from "vitest";
import {
  ARCHIVE_CHECKLIST,
  canSubmit,
  fileMeta,
  progressFor,
  progressLine,
  stagesFor,
  type UploadForm,
} from "./upload-form";

const form = (over: Partial<UploadForm> = {}): UploadForm => ({
  title: "",
  description: "",
  panoramaUrl: "",
  ...over,
});

const file = (size = 1024): File => new File([new Uint8Array(size)], "a.zip");

describe("canSubmit", () => {
  it("is true only once picked, with a file and a non-blank title", () => {
    expect(canSubmit("picked", file(), form({ title: "Refinery Block C" }))).toBe(true);
  });

  it("is false without a file", () => {
    expect(canSubmit("picked", null, form({ title: "T" }))).toBe(false);
  });

  it("is false with a blank or whitespace-only title", () => {
    expect(canSubmit("picked", file(), form({ title: "" }))).toBe(false);
    expect(canSubmit("picked", file(), form({ title: "   " }))).toBe(false);
  });

  it("is false outside the picked phase", () => {
    expect(canSubmit("idle", file(), form({ title: "T" }))).toBe(false);
    expect(canSubmit("uploading", file(), form({ title: "T" }))).toBe(false);
  });
});

describe("fileMeta", () => {
  it("prints size and the ZIP label", () => {
    expect(fileMeta(file(2_400_000_000))).toBe("2.2 GB · ZIP");
  });
});

describe("stagesFor", () => {
  it("leaves every stage pending before the upload starts", () => {
    const stages = stagesFor("idle");
    expect(stages.map((s) => s.state)).toEqual(["pending", "pending", "pending", "pending", "pending"]);
    expect(stagesFor("picked").map((s) => s.state)).toEqual(stages.map((s) => s.state));
  });

  it("activates Chunked upload while uploading, the rest pending", () => {
    const stages = stagesFor("uploading");
    expect(stages[0]).toMatchObject({ label: "Chunked upload", state: "active", time: "running" });
    expect(stages[1]).toMatchObject({ label: "Finalize blob", state: "pending", time: "queued" });
    expect(stages.slice(2).map((s) => s.state)).toEqual(["pending", "pending", "pending"]);
  });

  it("marks Chunked upload done and activates Finalize blob while finalizing", () => {
    const stages = stagesFor("finalizing");
    expect(stages[0]).toMatchObject({ state: "done", time: "done" });
    expect(stages[1]).toMatchObject({ state: "active", time: "running" });
  });

  it("marks both upload stages done once creating, the conversion stages still pending", () => {
    const stages = stagesFor("creating");
    expect(stages[0].state).toBe("done");
    expect(stages[1].state).toBe("done");
    expect(stages.slice(2).map((s) => s.state)).toEqual(["pending", "pending", "pending"]);
  });

  it("carries the mocked hint and time text for every stage, unaffected by phase", () => {
    const stages = stagesFor("uploading");
    expect(stages.map((s) => s.hint)).toEqual([
      "8 MB chunks, resumable",
      "content hash written",
      "geometry and materials",
      "three detail levels",
      "KTX2 artifacts",
    ]);
    expect(stages.slice(2).map((s) => s.time)).toEqual(["~1 min", "~2 min", "~1 min"]);
    expect(stages.map((s) => s.label)).toEqual([
      "Chunked upload",
      "Finalize blob",
      "Parse OBJ + MTL",
      "Build LOD 0-2",
      "Compress textures",
    ]);
  });
});

describe("progressLine", () => {
  it("formats the header and the four stat strings", () => {
    const line = progressLine(
      { bytes: 1_539_000_000, total: 2_400_000_000, chunk: 197, chunks: 308 },
      { bytesPerSecond: 24_600_000, etaSeconds: 180 },
    );
    expect(line.header).toBe("64% · 1.4 GB / 2.2 GB · ~3 min");
    expect(line.stats).toEqual(["chunk 197 / 308", "8 MB chunks", "23 MB/s", "resumable"]);
  });

  it("omits the eta segment and shows a dash speed when neither is known yet", () => {
    const line = progressLine(
      { bytes: 0, total: 1_000_000, chunk: 0, chunks: 1 },
      { bytesPerSecond: null, etaSeconds: null },
    );
    expect(line.header).toBe("0% · 0 B / 977 KB");
    expect(line.stats[2]).toBe("—");
  });
});

describe("progressFor", () => {
  const p = { bytes: 500_000, total: 1_000_000, chunk: 1, chunks: 2 };
  const samples = [
    { at: 0, bytes: 0 },
    { at: 1000, bytes: 500_000 },
  ];

  it("shows nothing before there is a byte sample", () => {
    expect(progressFor("uploading", null, [])).toBeUndefined();
  });

  it("shows nothing outside the uploading/finalizing phases, even mid-progress", () => {
    expect(progressFor("idle", p, samples)).toBeUndefined();
    expect(progressFor("picked", p, samples)).toBeUndefined();
    expect(progressFor("creating", p, samples)).toBeUndefined();
  });

  it("computes the panel from the phase's own byte progress while uploading", () => {
    expect(progressFor("uploading", p, samples)).toEqual({
      value: 50,
      header: "50% · 488 KB / 977 KB · <1 min",
      stats: ["chunk 1 / 2", "8 MB chunks", "488 KB/s", "resumable"],
    });
  });

  it("keeps showing the panel while finalizing", () => {
    expect(progressFor("finalizing", p, samples)).toMatchObject({ value: 50 });
  });
});

describe("ARCHIVE_CHECKLIST", () => {
  it("marks the first three items ok and the units item not", () => {
    expect(ARCHIVE_CHECKLIST.map((c) => c.ok)).toEqual([true, true, true, false]);
    expect(ARCHIVE_CHECKLIST[3]?.label).toBe("Metres as units — the viewer measures in metres");
  });
});
