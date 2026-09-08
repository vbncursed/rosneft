import { describe, expect, it } from "vitest";
import type { ModelCardModel } from "@/entities/model";
import { matchesModel, tabCounts } from "./catalog";

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
