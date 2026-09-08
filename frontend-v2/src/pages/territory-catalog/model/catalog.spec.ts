import { describe, expect, it } from "vitest";
import type { Artifact } from "@/entities/content";
import type { TargetJob } from "@/entities/conversion";
import type { Territory } from "@/entities/territory";
import { matchesTerritory, tabCounts, toTerritoryCard, type TerritoryCardModel } from "./catalog";

const territory = (over: Partial<Territory> = {}): Territory => ({
  slug: "north-ridge-pad",
  title: "North Ridge Pad",
  sourceBlobHash: "a".repeat(64),
  placementCount: 3,
  ...over,
});

const ZERO = { x: 0, y: 0, z: 0 };
const ARTIFACTS: Artifact[] = [
  { lod: 0, size: 300 * 1024 * 1024, hash: "h0", vertices: 0, faces: 0, bboxMin: ZERO, bboxMax: ZERO },
  { lod: 1, size: 100 * 1024 * 1024, hash: "h1", vertices: 0, faces: 0, bboxMin: ZERO, bboxMax: ZERO },
  { lod: 2, size: 12 * 1024 * 1024, hash: "h2", vertices: 0, faces: 0, bboxMin: ZERO, bboxMax: ZERO },
];

const job = (over: Partial<TargetJob> = {}): TargetJob => ({
  kind: "territory",
  slug: "north-ridge-pad",
  status: "running",
  progress: 0.62,
  stage: "compressing",
  errorMessage: null,
  ...over,
});

describe("toTerritoryCard", () => {
  it("is ready with placements, size and a panorama chip when one is set", () => {
    expect(
      toTerritoryCard(territory({ externalPanoramaUrl: "https://tour.example/x" }), ARTIFACTS),
    ).toEqual({
      slug: "north-ridge-pad",
      title: "North Ridge Pad",
      description: undefined,
      status: "ready",
      chips: [
        { label: "3 placements", tone: "plain" },
        { label: "412 MB", tone: "plain" },
        { label: "panorama", tone: "ok" },
      ],
      trailing: { label: "Open →", tone: "accent" },
      openable: true,
      panorama: true,
    });
  });

  it("prints 0 placements as a fact, not a dash — only the size chip dashes when unconverted", () => {
    const card = toTerritoryCard(territory({ placementCount: 0 }), ARTIFACTS);
    expect(card.chips).toEqual([
      { label: "0 placements", tone: "plain" },
      { label: "412 MB", tone: "plain" },
    ]);
    expect(card.panorama).toBe(false);
  });

  it("pluralises a single placement", () => {
    expect(toTerritoryCard(territory({ placementCount: 1 }), ARTIFACTS).chips[0]).toEqual({
      label: "1 placement",
      tone: "plain",
    });
  });

  it("dashes the size chip with nothing converted", () => {
    const card = toTerritoryCard(territory(), []);
    expect(card.status).toBe("pending");
    expect(card.chips).toEqual([
      { label: "3 placements", tone: "plain" },
      { label: "—", tone: "plain" },
    ]);
    expect(card.trailing).toEqual({ label: "pending", tone: "muted" });
    // Openable whatever the status: the card leads to the territory's own
    // page, which is the conversion screen until the artifacts land.
    expect(card.openable).toBe(true);
  });

  it("is converting with a LOD chip, a size chip and a humanised progress stage", () => {
    const card = toTerritoryCard(territory(), ARTIFACTS, job());
    expect(card.status).toBe("converting");
    expect(card.chips).toEqual([
      { label: "LOD 0-2", tone: "warn" },
      { label: "412 MB", tone: "plain" },
    ]);
    expect(card.progress).toEqual({ value: 62, stage: "Compressing textures" });
    expect(card.trailing).toEqual({ label: "converting", tone: "muted" });
    expect(card.openable).toBe(true);
  });

  it("reads a queued job (no progress reported yet) as 0%, stage Queued", () => {
    const card = toTerritoryCard(territory(), [], job({ status: "pending", progress: null, stage: null }));
    expect(card.progress).toEqual({ value: 0, stage: "Queued" });
  });

  it("is failed when the job failed, whatever the artifacts already hold", () => {
    const card = toTerritoryCard(
      territory({ placementCount: 0 }),
      ARTIFACTS,
      job({ status: "failed", progress: null, stage: null, errorMessage: "boom" }),
    );
    expect(card.status).toBe("failed");
    expect(card.trailing).toEqual({ label: "unavailable", tone: "muted" });
    expect(card.progress).toBeUndefined();
    // The state the conversion page exists to show must be reachable.
    expect(card.openable).toBe(true);
  });

  it("carries the description through untouched", () => {
    expect(toTerritoryCard(territory({ description: "Wellhead cluster." }), []).description).toBe(
      "Wellhead cluster.",
    );
  });
});

describe("tabCounts", () => {
  const card = (over: Partial<TerritoryCardModel> = {}): TerritoryCardModel => ({
    slug: "t",
    title: "T",
    status: "ready",
    chips: [],
    trailing: { label: "Open →", tone: "accent" },
    openable: true,
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
    openable: true,
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
