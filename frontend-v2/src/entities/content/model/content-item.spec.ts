import { describe, expect, it } from "vitest";
import {
  contentPath,
  hasArtifacts,
  isOpenable,
  matchesFilters,
  matchesText,
  pipelineCounts,
  type ContentItem,
} from "./content-item";

const item = (over: Partial<ContentItem> = {}): ContentItem => ({
  kind: "territory",
  slug: "north-ridge-pad",
  title: "North Ridge Pad",
  status: "ready",
  meta: "north-ridge-pad · upd. 31.08 · 3 placements",
  lods: "LOD 0-2",
  size: "412 MB",
  ...over,
});

describe("contentPath", () => {
  it("routes each kind to its own section", () => {
    expect(contentPath(item())).toBe("/territories/north-ridge-pad");
    expect(contentPath(item({ kind: "model", slug: "pump-jack" }))).toBe("/models/pump-jack");
  });
});

describe("isOpenable / hasArtifacts", () => {
  it("opens only a finished conversion", () => {
    expect(isOpenable(item())).toBe(true);
    expect(isOpenable(item({ status: "converting" }))).toBe(false);
  });

  it("reads an em dash as 'nothing converted yet'", () => {
    expect(hasArtifacts(item())).toBe(true);
    expect(hasArtifacts(item({ lods: "—" }))).toBe(false);
  });
});

describe("matchesFilters", () => {
  it("matches on kind and status", () => {
    expect(matchesFilters(item(), [{ key: "kind", value: "territory" }])).toBe(true);
    expect(matchesFilters(item(), [{ key: "kind", value: "model" }])).toBe(false);
    expect(matchesFilters(item({ status: "failed" }), [{ key: "status", value: "failed" }])).toBe(true);
  });

  it("matches a LOD level inside the label", () => {
    expect(matchesFilters(item(), [{ key: "lod", value: "2" }])).toBe(true);
    expect(matchesFilters(item({ lods: "LOD 0-1" }), [{ key: "lod", value: "2" }])).toBe(false);
  });

  it("requires every filter to hold", () => {
    const filters = [
      { key: "kind", value: "territory" },
      { key: "status", value: "converting" },
    ];
    expect(matchesFilters(item(), filters)).toBe(false);
    expect(matchesFilters(item({ status: "converting" }), filters)).toBe(true);
  });

  it("matches everything when there is nothing to match on", () => {
    expect(matchesFilters(item(), [])).toBe(true);
  });

  it("matches nothing for an unknown key, rather than ignoring the typo", () => {
    expect(matchesFilters(item(), [{ key: "kidn", value: "territory" }])).toBe(false);
  });

  it("is case-insensitive on the value", () => {
    expect(matchesFilters(item(), [{ key: "kind", value: "TERRITORY" }])).toBe(true);
  });
});

describe("matchesText", () => {
  it("matches title, slug and the meta line", () => {
    expect(matchesText(item(), "north ridge")).toBe(true);
    expect(matchesText(item(), "north-ridge-pad")).toBe(true);
    expect(matchesText(item(), "placements")).toBe(true);
  });

  it("matches everything on empty or blank text", () => {
    expect(matchesText(item(), "")).toBe(true);
    expect(matchesText(item(), "   ")).toBe(true);
  });

  it("does not match what is not there", () => {
    expect(matchesText(item(), "refinery")).toBe(false);
  });
});

describe("pipelineCounts", () => {
  it("splits the catalog by conversion state", () => {
    expect(
      pipelineCounts([item(), item({ status: "converting" }), item({ status: "failed" }), item()]),
    ).toEqual({ ready: 2, pending: 0, converting: 1, failed: 1 });
  });

  it("counts an empty catalog as zero everywhere", () => {
    expect(pipelineCounts([])).toEqual({ ready: 0, pending: 0, converting: 0, failed: 0 });
  });

  it("counts the never-converted rows apart from the converting ones", () => {
    const counts = pipelineCounts([item({ status: "pending" }), item({ status: "ready" })]);
    expect(counts).toEqual({ ready: 1, pending: 1, converting: 0, failed: 0 });
  });
});
