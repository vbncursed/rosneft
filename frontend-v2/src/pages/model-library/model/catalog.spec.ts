import { describe, expect, it } from "vitest";
import type { Artifact } from "@/entities/content";
import type { TargetJob } from "@/entities/conversion";
import type { Model } from "@/entities/model";
import { matchesModel, tabCounts, toModelCard, type ModelCardModel } from "./catalog";

const model = (over: Partial<Model> = {}): Model => ({
  slug: "pump-jack-unit",
  title: "Pump Jack Unit",
  sourceBlobHash: "a".repeat(64),
  usageCount: 6,
  ...over,
});

const ARTIFACTS: Artifact[] = [
  { lod: 0, size: 30 * 1024 * 1024 },
  { lod: 1, size: 6 * 1024 * 1024 },
  { lod: 2, size: 2 * 1024 * 1024 },
];

const job = (over: Partial<TargetJob> = {}): TargetJob => ({
  kind: "model",
  slug: "pump-jack-unit",
  status: "running",
  progress: 0.5,
  stage: "encoding",
  errorMessage: null,
  ...over,
});

describe("toModelCard", () => {
  it("is ready with a thumbnail, a size chip and the plural in-use trailing", () => {
    expect(
      toModelCard(model({ thumbnailBlobHash: "b".repeat(64) }), ARTIFACTS),
    ).toEqual({
      slug: "pump-jack-unit",
      title: "Pump Jack Unit",
      status: "ready",
      thumbnailUrl: "/api/assets/" + "b".repeat(64),
      usageCount: 6,
      size: "38 MB",
      lods: "LOD 0-2",
      trailing: { label: "in 6 territories", tone: "accent" },
    });
  });

  it("singularises a single placement", () => {
    expect(toModelCard(model({ usageCount: 1 }), ARTIFACTS).trailing).toEqual({
      label: "in 1 territory",
      tone: "accent",
    });
  });

  it("reads zero usage as unused, muted", () => {
    expect(toModelCard(model({ usageCount: 0 }), ARTIFACTS).trailing).toEqual({
      label: "unused",
      tone: "muted",
    });
  });

  it("has no thumbnail url without a thumbnailBlobHash", () => {
    expect(toModelCard(model(), ARTIFACTS).thumbnailUrl).toBeNull();
  });

  it("does not dash the size chip when artifacts exist", () => {
    expect(toModelCard(model(), ARTIFACTS).size).toBe("38 MB");
  });

  it("dashes the size chip with nothing converted", () => {
    expect(toModelCard(model(), []).size).toBe("—");
  });

  it("is converting with a queued trailing, whatever the usage count says", () => {
    const card = toModelCard(model({ usageCount: 6 }), ARTIFACTS, job());
    expect(card.status).toBe("converting");
    expect(card.trailing).toEqual({ label: "queued", tone: "warn" });
  });

  it("is failed with an unavailable trailing, whatever the usage count says", () => {
    const card = toModelCard(
      model({ usageCount: 3 }),
      [],
      job({ status: "failed", progress: null, stage: null, errorMessage: "boom" }),
    );
    expect(card.status).toBe("failed");
    expect(card.trailing).toEqual({ label: "unavailable", tone: "bad" });
  });

  it("dashes lods with nothing converted", () => {
    expect(toModelCard(model(), []).lods).toBe("—");
  });
});

describe("tabCounts", () => {
  const card = (over: Partial<ModelCardModel> = {}): ModelCardModel => ({
    slug: "m",
    title: "M",
    status: "ready",
    thumbnailUrl: null,
    usageCount: 0,
    size: "—",
    lods: "LOD 0",
    trailing: { label: "unused", tone: "muted" },
    ...over,
  });

  it("counts all, inUse and noImage", () => {
    expect(
      tabCounts([
        card({ usageCount: 3, thumbnailUrl: "x" }),
        card({ usageCount: 0, thumbnailUrl: "x" }),
        card({ usageCount: 0, thumbnailUrl: null }),
      ]),
    ).toEqual({ all: 3, inUse: 1, noImage: 1 });
  });

  it("counts an empty library as zero everywhere", () => {
    expect(tabCounts([])).toEqual({ all: 0, inUse: 0, noImage: 0 });
  });
});

describe("matchesModel", () => {
  const card = (over: Partial<ModelCardModel> = {}): ModelCardModel => ({
    slug: "pump-jack-unit",
    title: "Pump Jack Unit",
    status: "ready",
    thumbnailUrl: "/api/assets/x",
    usageCount: 6,
    size: "38 MB",
    lods: "LOD 0-2",
    trailing: { label: "in 6 territories", tone: "accent" },
    ...over,
  });

  it("narrows by the inUse tab", () => {
    expect(matchesModel(card({ usageCount: 6 }), "inUse", "")).toBe(true);
    expect(matchesModel(card({ usageCount: 0 }), "inUse", "")).toBe(false);
    expect(matchesModel(card({ usageCount: 0 }), "all", "")).toBe(true);
  });

  it("narrows by the noImage tab", () => {
    expect(matchesModel(card({ thumbnailUrl: null }), "noImage", "")).toBe(true);
    expect(matchesModel(card({ thumbnailUrl: "x" }), "noImage", "")).toBe(false);
  });

  it("narrows by thumbnail:", () => {
    expect(matchesModel(card({ thumbnailUrl: null }), "all", "thumbnail:none")).toBe(true);
    expect(matchesModel(card({ thumbnailUrl: "x" }), "all", "thumbnail:none")).toBe(false);
    expect(matchesModel(card({ thumbnailUrl: "x" }), "all", "thumbnail:yes")).toBe(true);
  });

  it("matches nothing for a thumbnail: value that is neither none nor yes", () => {
    expect(matchesModel(card({ thumbnailUrl: null }), "all", "thumbnail:no")).toBe(false);
    expect(matchesModel(card({ thumbnailUrl: "x" }), "all", "thumbnail:true")).toBe(false);
  });

  it("narrows by used:", () => {
    expect(matchesModel(card({ usageCount: 0 }), "all", "used:0")).toBe(true);
    expect(matchesModel(card({ usageCount: 6 }), "all", "used:0")).toBe(false);
  });

  it("narrows by lod:", () => {
    expect(matchesModel(card({ lods: "LOD 0-2" }), "all", "lod:2")).toBe(true);
    expect(matchesModel(card({ lods: "LOD 0" }), "all", "lod:2")).toBe(false);
  });

  it("matches free text on title or slug", () => {
    expect(matchesModel(card(), "all", "pump")).toBe(true);
    expect(matchesModel(card(), "all", "pump-jack-unit")).toBe(true);
    expect(matchesModel(card(), "all", "valve")).toBe(false);
  });

  it("matches nothing for an unknown key, rather than ignoring the typo", () => {
    expect(matchesModel(card(), "all", "colour:blue")).toBe(false);
  });

  it("matches everything with an empty query", () => {
    expect(matchesModel(card(), "all", "")).toBe(true);
  });
});
