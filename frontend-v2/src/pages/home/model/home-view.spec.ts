import { describe, expect, it } from "vitest";
import type { TargetJob } from "@/entities/conversion";
import type { TerritoryCardModel } from "@/entities/territory";
import {
  bareCard, headerMeta, jobsMeta, modelsMeta, plural, recent, seeAll, showConsole, territoriesMeta, titleOf, viewerEmpty,
} from "./home-view";

const job = (over: Partial<TargetJob> = {}): TargetJob => ({
  kind: "territory", slug: "t", status: "running", progress: 0.5, stage: "parsing", errorMessage: null, ...over,
});

describe("recent", () => {
  it("orders by updatedAt descending, undefined last, slug within a tie, and cuts at n", () => {
    const items = [
      { slug: "d" },
      { slug: "b", updatedAt: "2026-09-01T00:00:00Z" },
      { slug: "c", updatedAt: "2026-09-02T00:00:00Z" },
      { slug: "a", updatedAt: "2026-09-01T00:00:00Z" },
    ];
    expect(recent(items, 3).map((i) => i.slug)).toEqual(["c", "a", "b"]);
    expect(recent(items, 10).map((i) => i.slug)).toEqual(["c", "a", "b", "d"]);
  });
  it("orders by the instant, not the string — Go trims trailing zeros off RFC3339Nano", () => {
    // ".5Z" and ".50001Z" are the same millisecond, so slug breaks the tie;
    // as strings the trimmed one sorts after the longer and reads as older.
    expect(
      recent(
        [
          { slug: "a", updatedAt: "2026-09-01T10:00:53.50001Z" },
          { slug: "b", updatedAt: "2026-09-01T10:00:53.5Z" },
        ],
        2,
      ).map((i) => i.slug),
    ).toEqual(["a", "b"]);
    expect(
      recent(
        [
          { slug: "trimmed", updatedAt: "2026-09-01T10:00:00Z" },
          { slug: "later", updatedAt: "2026-09-01T10:00:00.5Z" },
        ],
        2,
      ).map((i) => i.slug),
    ).toEqual(["later", "trimmed"]);
  });

  it("puts an unparseable date last, beside the undefined ones", () => {
    expect(
      recent(
        [
          { slug: "bad", updatedAt: "not a date" },
          { slug: "none" },
          { slug: "dated", updatedAt: "2026-09-01T00:00:00Z" },
        ],
        3,
      ).map((i) => i.slug),
    ).toEqual(["dated", "bad", "none"]);
  });

  it("orders two undated entries by slug", () => {
    expect(recent([{ slug: "b" }, { slug: "a" }], 2).map((i) => i.slug)).toEqual(["a", "b"]);
  });

  it("does not mutate its input", () => {
    const items = [{ slug: "b" }, { slug: "a" }];
    recent(items, 2);
    expect(items[0].slug).toBe("b");
  });
});

describe("viewerEmpty", () => {
  it("is empty only with no territories and no upload right of either kind", () => {
    expect(viewerEmpty(0, false, false)).toBe(true);
    expect(viewerEmpty(0, true, false)).toBe(false);
    expect(viewerEmpty(0, false, true)).toBe(false);
    expect(viewerEmpty(2, false, false)).toBe(false);
  });
});

describe("headerMeta", () => {
  it("counts territories, models and the jobs in flight", () => {
    expect(headerMeta(4, 57, [job(), job({ slug: "u", status: "failed" })], false)).toBe("4 territories · 57 models · 1 converting · 1 failed");
  });
  it("says nothing converting when the strip is empty", () => {
    expect(headerMeta(4, 57, [], false)).toBe("4 territories · 57 models · nothing converting");
  });
  it("names only the side that has jobs", () => {
    expect(headerMeta(1, 1, [job({ status: "pending" })], false)).toBe("1 territory · 1 model · 1 converting");
    expect(headerMeta(1, 1, [job({ status: "failed" })], false)).toBe("1 territory · 1 model · 1 failed");
  });
  it("reads read-only for a viewer with nothing assigned", () => {
    expect(headerMeta(0, 57, [], true)).toBe("0 territories assigned · read-only access");
  });
});

describe("territoriesMeta / modelsMeta / seeAll", () => {
  it("shows the slice, the assignment line, or none yet", () => {
    expect(territoriesMeta(4, 12, false)).toBe("showing 4 of 12");
    expect(territoriesMeta(0, 0, true)).toBe("assigned to you");
    expect(territoriesMeta(0, 0, false)).toBe("none yet");
  });
  it("counts the library", () => {
    expect(modelsMeta(57)).toBe("57 in the library");
    expect(modelsMeta(1)).toBe("1 in the library");
    expect(modelsMeta(0)).toBe("none yet");
  });
  it("spells the see-all links", () => {
    expect(seeAll("territories", 12)).toBe("See all 12 territories →");
    expect(seeAll("models", 57)).toBe("See all 57 models →");
  });
});

describe("jobsMeta", () => {
  it("promises updates only while a job is live", () => {
    expect(jobsMeta([job(), job({ slug: "u", status: "failed" })])).toBe("2 jobs · updates by itself");
    expect(jobsMeta([job({ status: "failed" })])).toBe("1 job");
  });
});

describe("titleOf / showConsole / bareCard / plural", () => {
  it("looks a title up by kind and slug", () => {
    const f = titleOf(
      [{ slug: "a", title: "A", sourceBlobHash: "x", placementCount: 0 }],
      [{ slug: "a", title: "Model A", sourceBlobHash: "x", usageCount: 0 }],
    );
    expect(f("territory", "a")).toBe("A");
    expect(f("model", "a")).toBe("Model A");
    expect(f("model", "zz")).toBeUndefined();
  });
  it("shows the console when any item is open", () => {
    expect(showConsole([{ key: "users", label: "Users", href: "/console/users", disabled: true }])).toBe(false);
    expect(showConsole([{ key: "content", label: "Content", href: "/console/content" }])).toBe(true);
  });
  it("strips chips and progress off a card", () => {
    const card: TerritoryCardModel = {
      slug: "t", title: "T", status: "converting", chips: [{ label: "x", tone: "plain" }],
      progress: { value: 1, stage: "s" }, trailing: { label: "converting", tone: "muted" }, panorama: false,
    };
    expect(bareCard(card)).toEqual({ ...card, chips: [], progress: undefined });
  });
  it("pluralises", () => {
    expect(plural(1, "territory", "territories")).toBe("1 territory");
    expect(plural(0, "territory", "territories")).toBe("0 territories");
  });
});
