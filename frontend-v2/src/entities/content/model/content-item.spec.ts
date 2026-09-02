import { describe, expect, it } from "vitest";
import {
  contentPath,
  countByKind,
  filterContent,
  isOpenable,
  type ContentItem,
} from "./content-item";

const item = (over: Partial<ContentItem> = {}): ContentItem => ({
  kind: "territory",
  slug: "north-ridge-pad",
  title: "North Ridge Pad",
  status: "ready",
  size: "412 MB",
  lods: "0-2",
  updated: "31.08",
  ...over,
});

const ITEMS = [
  item(),
  item({ slug: "refinery-block-c", title: "Refinery Block C" }),
  item({ kind: "model", slug: "pump-jack-unit", title: "Pump Jack Unit" }),
  item({ kind: "model", slug: "flare-stack", title: "Flare Stack", status: "failed" }),
];

describe("contentPath", () => {
  it("routes each kind to its own section", () => {
    expect(contentPath(item())).toBe("/territories/north-ridge-pad");
    expect(contentPath(item({ kind: "model", slug: "pump-jack-unit" }))).toBe(
      "/models/pump-jack-unit",
    );
  });
});

describe("isOpenable", () => {
  it("opens only a finished conversion", () => {
    expect(isOpenable(item())).toBe(true);
    expect(isOpenable(item({ status: "converting" }))).toBe(false);
    expect(isOpenable(item({ status: "failed" }))).toBe(false);
  });
});

describe("filterContent", () => {
  it("keeps everything on the All tab with no query", () => {
    expect(filterContent(ITEMS, "all", "")).toHaveLength(4);
  });

  it("narrows to one kind", () => {
    expect(filterContent(ITEMS, "territory", "")).toHaveLength(2);
    expect(filterContent(ITEMS, "model", "")).toHaveLength(2);
  });

  it("matches on title and on slug, case-insensitively", () => {
    expect(filterContent(ITEMS, "all", "refinery")).toHaveLength(1);
    expect(filterContent(ITEMS, "all", "PUMP-JACK")).toHaveLength(1);
    expect(filterContent(ITEMS, "all", "Flare Stack")).toHaveLength(1);
  });

  it("ignores surrounding whitespace", () => {
    expect(filterContent(ITEMS, "all", "  refinery  ")).toHaveLength(1);
  });

  it("combines the tab and the query", () => {
    expect(filterContent(ITEMS, "model", "refinery")).toHaveLength(0);
    expect(filterContent(ITEMS, "model", "flare")).toHaveLength(1);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterContent(ITEMS, "all", "nonexistent")).toEqual([]);
  });
});

describe("countByKind", () => {
  it("counts each kind and the whole", () => {
    expect(countByKind(ITEMS)).toEqual({ all: 4, territory: 2, model: 2 });
  });

  it("counts an empty catalog as zero everywhere", () => {
    expect(countByKind([])).toEqual({ all: 0, territory: 0, model: 0 });
  });
});
