import { describe, expect, it } from "vitest";
import type { TerritoryCardModel } from "@/entities/territory";
import { matchesTerritory, tabCounts } from "./catalog";

describe("tabCounts", () => {
  const card = (over: Partial<TerritoryCardModel> = {}): TerritoryCardModel => ({
    slug: "t",
    title: "T",
    status: "ready",
    chips: [],
    trailing: { label: "Open →", tone: "accent" },
    panorama: false,
    ...over,
  });

  it("counts all, ready and converting", () => {
    expect(
      tabCounts([card(), card({ status: "converting" }), card({ status: "failed" }), card()]),
    ).toEqual({ all: 4, ready: 2, converting: 1 });
  });

  it("counts an empty catalog as zero everywhere", () => {
    expect(tabCounts([])).toEqual({ all: 0, ready: 0, converting: 0 });
  });
});

describe("matchesTerritory", () => {
  const card = (over: Partial<TerritoryCardModel> = {}): TerritoryCardModel => ({
    slug: "north-ridge-pad",
    title: "North Ridge Pad",
    status: "ready",
    chips: [],
    trailing: { label: "Open →", tone: "accent" },
    panorama: true,
    ...over,
  });

  it("narrows by tab", () => {
    const converting = card({ slug: "terminal-yard-4", status: "converting" });
    expect(matchesTerritory(converting, "all", "")).toBe(true);
    expect(matchesTerritory(converting, "ready", "")).toBe(false);
    expect(matchesTerritory(converting, "converting", "")).toBe(true);
    expect(matchesTerritory(card(), "converting", "")).toBe(false);
  });

  it("narrows by state:", () => {
    expect(matchesTerritory(card({ status: "failed" }), "all", "state:failed")).toBe(true);
    expect(matchesTerritory(card({ status: "failed" }), "all", "state:ready")).toBe(false);
  });

  it("narrows by panorama:", () => {
    expect(matchesTerritory(card({ panorama: true }), "all", "panorama:yes")).toBe(true);
    expect(matchesTerritory(card({ panorama: true }), "all", "panorama:true")).toBe(true);
    expect(matchesTerritory(card({ panorama: false }), "all", "panorama:yes")).toBe(false);
    expect(matchesTerritory(card({ panorama: false }), "all", "panorama:no")).toBe(true);
  });

  it("matches free text on title or slug", () => {
    expect(matchesTerritory(card(), "all", "ridge")).toBe(true);
    expect(matchesTerritory(card(), "all", "north-ridge-pad")).toBe(true);
    expect(matchesTerritory(card(), "all", "refinery")).toBe(false);
  });

  it("matches nothing for an unknown key, rather than ignoring the typo", () => {
    expect(matchesTerritory(card(), "all", "colour:blue")).toBe(false);
  });

  it("matches everything with an empty query", () => {
    expect(matchesTerritory(card(), "all", "")).toBe(true);
  });
});
