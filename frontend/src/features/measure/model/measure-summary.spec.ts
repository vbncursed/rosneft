import { describe, expect, it } from "vitest";
import type { Chain } from "@/entities/measurement";
import { measureSummary, notSaved } from "./measure-summary";

const p = (x: number, y = 0, z = 0) => ({ x, y, z });

describe("measureSummary", () => {
  it("counts segments across chains and totals their length in source units", () => {
    const chains: Chain[] = [
      { id: 1, points: [p(0), p(1), p(1, 1)], closed: false, sync: "local" },
      { id: 2, points: [p(0), p(0, 0, 2)], closed: false, sync: "local" },
    ];
    expect(measureSummary(chains, 10)).toEqual({ segments: 3, total: "40.00 m" });
  });
  it("counts the closing segment of a closed chain", () => {
    expect(measureSummary([{ id: 1, points: [p(0), p(1), p(1, 1)], closed: true, sync: "local" }], 1).segments).toBe(3);
  });
  it("is empty with no chains", () => {
    expect(measureSummary([], 10)).toEqual({ segments: 0, total: "0.00 m" });
  });
});

describe("notSaved", () => {
  const chain = (id: number, over: Partial<Chain> = {}): Chain => ({
    id,
    points: [p(0), p(1)],
    closed: false,
    sync: "local",
    ...over,
  });
  it("names the last finished chain a reader cannot save", () => {
    expect(notSaved([chain(1)], null, false)).toBe(true);
  });
  it("is quiet for a reader whose last finished chain is someone's saved one", () => {
    expect(notSaved([chain(1), chain(2, { serverId: 9, sync: "saved" })], null, false)).toBe(false);
  });
  it("looks past the chain still being drawn", () => {
    expect(notSaved([chain(1), chain(2)], 2, false)).toBe(true);
    expect(notSaved([chain(1, { serverId: 9, sync: "saved" }), chain(2)], 2, false)).toBe(false);
  });
  it("names a failed save, whoever holds the grant", () => {
    expect(notSaved([chain(1, { sync: "failed" })], null, true)).toBe(true);
    expect(notSaved([chain(1, { serverId: 9, sync: "failed" })], null, true)).toBe(true);
  });
  it("is quiet for a writer whose chain is saved or on its way", () => {
    expect(notSaved([chain(1, { sync: "saving" })], null, true)).toBe(false);
    expect(notSaved([chain(1, { serverId: 9, sync: "saved" })], null, true)).toBe(false);
  });
  it("is quiet with nothing finished", () => {
    expect(notSaved([], null, false)).toBe(false);
    expect(notSaved([chain(1)], 1, false)).toBe(false);
  });
});
