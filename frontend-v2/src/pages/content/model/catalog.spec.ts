import { describe, expect, it } from "vitest";
import type { ContentItem } from "@/entities/content";
import {
  conversionNoteOf,
  groupContent,
  inspectorDetails,
  matchesContent,
  pipelineOf,
  replaceHref,
  statsOf,
  toContentItem,
  uploadHref,
} from "./catalog";

const territory = {
  slug: "north-ridge-pad",
  title: "North Ridge Pad",
  sourceBlobHash: "a".repeat(64),
  updatedAt: "2026-08-31T10:00:00Z",
};
const model = { slug: "pump-jack-unit", title: "Pump Jack Unit", sourceBlobHash: "b".repeat(64) };
const ARTIFACTS = [
  { lod: 0, size: 300 * 1024 * 1024 },
  { lod: 1, size: 100 * 1024 * 1024 },
  { lod: 2, size: 12 * 1024 * 1024 },
];

const item = (over: Partial<ContentItem> = {}): ContentItem => ({
  kind: "territory",
  slug: "t",
  title: "T",
  status: "ready",
  meta: "t",
  lods: "LOD 0",
  size: "1 MB",
  ...over,
});

describe("toContentItem", () => {
  it("is ready with artifacts, with LODs, size and an updated date in the meta", () => {
    expect(toContentItem("territory", territory, ARTIFACTS)).toEqual({
      kind: "territory",
      slug: "north-ridge-pad",
      title: "North Ridge Pad",
      status: "ready",
      meta: "north-ridge-pad · upd. 31.08",
      lods: "LOD 0-2",
      size: "412 MB",
    });
  });

  it("is pending with none, and the meta is the slug alone without a date", () => {
    expect(toContentItem("model", model, [])).toEqual({
      kind: "model",
      slug: "pump-jack-unit",
      title: "Pump Jack Unit",
      status: "pending",
      meta: "pump-jack-unit",
      lods: "—",
      size: "—",
    });
  });
});

describe("matchesContent", () => {
  it("narrows by the catalog's chips and free text", () => {
    const pending = item({
      kind: "model",
      slug: "flare",
      title: "Flare Stack",
      status: "pending",
      lods: "—",
    });
    expect(matchesContent(pending, "kind:model status:pending")).toBe(true);
    expect(matchesContent(pending, "kind:territory")).toBe(false);
    expect(matchesContent(pending, "flare")).toBe(true);
    expect(matchesContent(pending, "colour:blue")).toBe(false);
  });
});

describe("groupContent", () => {
  it("splits by kind in catalog order with a ready/pending note", () => {
    const groups = groupContent([
      item({ kind: "model", slug: "m1", status: "pending" }),
      item({ slug: "t1" }),
      item({ slug: "t2", status: "pending" }),
    ]);
    expect(groups.map((g) => [g.key, g.label, g.note, g.items.map((i) => i.slug)])).toEqual([
      ["territories", "Territories", "1 ready · 1 pending", ["t1", "t2"]],
      ["models", "Models", "0 ready · 1 pending", ["m1"]],
    ]);
  });

  it("lifts whatever needs attention out of the kind groups and puts it first", () => {
    const groups = groupContent([
      item({ slug: "t1" }),
      item({ slug: "t2", status: "converting" }),
      item({ kind: "model", slug: "m1", status: "failed" }),
    ]);
    expect(groups.map((g) => [g.key, g.label, g.note, g.items.map((i) => i.slug)])).toEqual([
      ["attention", "Needs attention", "1 converting · 1 failed", ["t2", "m1"]],
      ["territories", "Territories", "1 ready", ["t1"]],
      ["models", "Models", "0 ready", []],
    ]);
  });

  it("draws no attention group when nothing needs any", () => {
    const groups = groupContent([item({ slug: "t1" }), item({ kind: "model", slug: "m1" })]);
    expect(groups.map((g) => g.key)).toEqual(["territories", "models"]);
  });

  it("drops a state the group does not hold, and always keeps ready", () => {
    const [territories, models] = groupContent([
      item({ slug: "t1" }),
      item({ slug: "t2", status: "pending" }),
    ]);
    expect(territories.note).toBe("1 ready · 1 pending");
    expect(models.note).toBe("0 ready");
  });
});

describe("pipelineOf and statsOf", () => {
  it("meters the pipeline and fills the three tiles", () => {
    const items = [item(), item({ kind: "model", slug: "m", status: "pending" })];
    expect(pipelineOf(items)).toEqual({
      label: "Conversion pipeline",
      detail: "1 of 2 ready",
      segments: [
        { tone: "ok", value: 1, label: "ready" },
        { tone: "neutral", value: 1, label: "pending" },
        { tone: "warn", value: 0, label: "converting" },
        { tone: "bad", value: 0, label: "failed" },
      ],
    });
    // The tiles count the whole catalog — a failed row is lifted out of its
    // kind group on the list, but it is still a territory.
    expect(statsOf([item(), ...Array.from({ length: 5 }, (_, i) =>
      item({ slug: `f${i}`, status: "failed" as const }))], 0)[0].hint).toBe("1 ready · 5 failed");
    expect(statsOf(items, 184 * 1024 ** 3)).toEqual([
      { label: "Territories", value: "1", hint: "1 ready" },
      { label: "Models", value: "1", hint: "0 ready · 1 pending" },
      { label: "Storage", value: "184 GB", hint: "GLB + KTX2 artifacts", tone: "accent" },
    ]);
  });
});

describe("inspectorDetails", () => {
  it("lists artifacts, LODs, size and the update date, dashes when unknown", () => {
    expect(
      inspectorDetails(item({ lods: "LOD 0-2", size: "412 MB" }), ARTIFACTS, territory.updatedAt, undefined),
    ).toEqual([
      { label: "Artifacts", value: "3" },
      { label: "LODs", value: "LOD 0-2" },
      { label: "Size", value: "412 MB" },
      { label: "Updated", value: "31.08" },
    ]);
    expect(
      inspectorDetails(item({ status: "pending", lods: "—", size: "—" }), [], undefined, undefined),
    ).toEqual(
      [
        { label: "Artifacts", value: "0", tone: "dim" },
        { label: "LODs", value: "—", tone: "dim" },
        { label: "Size", value: "—", tone: "dim" },
        { label: "Updated", value: "—", tone: "dim" },
      ],
    );
  });
});

describe("hrefs into the old SPA", () => {
  it("names the upload forms and the territory's replace route", () => {
    expect(uploadHref("territory")).toBe("/territories/new");
    expect(uploadHref("model")).toBe("/models/new");
    expect(replaceHref(item({ kind: "territory", slug: "t-1" }))).toBe("/territories/t-1/replace");
    expect(replaceHref(item({ kind: "model", slug: "m-1" }))).toBeNull();
  });
});

describe("toContentItem with a job", () => {
  const running = {
    kind: "territory" as const,
    slug: "north-ridge-pad",
    status: "running" as const,
    progress: 0.62,
    stage: "textures",
    errorMessage: null,
  };
  const failed = {
    ...running,
    status: "failed" as const,
    progress: null,
    stage: null,
    errorMessage: "OBJ parse error at line 84120",
  };

  it("is converting with a percentage and a stage while the job runs, keeping what is already converted", () => {
    expect(toContentItem("territory", territory, ARTIFACTS, running)).toMatchObject({
      status: "converting",
      progress: 62,
      stage: "textures",
      lods: "LOD 0-2",
      size: "412 MB",
    });
    // Queued: no percentage and no stage at all, rather than a confident zero.
    const queued = toContentItem("territory", territory, [], {
      ...running,
      status: "pending",
      progress: null,
      stage: null,
    });
    expect(queued).toMatchObject({ status: "converting", lods: "—", size: "—" });
    expect(queued).not.toHaveProperty("progress");
    expect(queued).not.toHaveProperty("stage");
  });

  it("is failed when the job failed, whatever the artifacts say", () => {
    expect(toContentItem("territory", territory, ARTIFACTS, failed).status).toBe("failed");
    expect(toContentItem("territory", territory, [], failed).status).toBe("failed");
  });

  it("ignores a succeeded job — the artifacts decide", () => {
    expect(toContentItem("territory", territory, [], { ...running, status: "succeeded" }).status).toBe(
      "pending",
    );
  });

  it("puts the worker's message in the inspector and a note above the bar", () => {
    expect(
      inspectorDetails(item({ status: "failed" }), ARTIFACTS, territory.updatedAt, failed)[0],
    ).toEqual({ label: "Error", value: "OBJ parse error at line 84120", tone: "bad" });
    expect(inspectorDetails(item(), ARTIFACTS, territory.updatedAt, undefined)[0].label).toBe(
      "Artifacts",
    );
    expect(conversionNoteOf(running)).toBe("62% · textures");
    expect(conversionNoteOf({ ...running, progress: null, stage: null })).toBe("queued");
    expect(conversionNoteOf(failed)).toBeUndefined();
  });
});
