import { describe, expect, it } from "vitest";
import type { ContentItem } from "@/entities/content";
import {
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
    expect(statsOf(items, 184 * 1024 ** 3)).toEqual([
      { label: "Territories", value: "1", hint: "1 ready · 0 pending" },
      { label: "Models", value: "1", hint: "0 ready · 1 pending" },
      { label: "Storage", value: "184 GB", hint: "GLB + KTX2 artifacts", tone: "accent" },
    ]);
  });
});

describe("inspectorDetails", () => {
  it("lists artifacts, LODs, size and the update date, dashes when unknown", () => {
    expect(
      inspectorDetails(item({ lods: "LOD 0-2", size: "412 MB" }), ARTIFACTS, territory.updatedAt),
    ).toEqual([
      { label: "Artifacts", value: "3" },
      { label: "LODs", value: "LOD 0-2" },
      { label: "Size", value: "412 MB" },
      { label: "Updated", value: "31.08" },
    ]);
    expect(inspectorDetails(item({ status: "pending", lods: "—", size: "—" }), [], undefined)).toEqual(
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
