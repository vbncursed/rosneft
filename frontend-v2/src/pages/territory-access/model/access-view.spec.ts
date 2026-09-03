import { describe, expect, it } from "vitest";
import type { TerritoryAccess } from "@/entities/territory";
import type { User } from "@/entities/user";
import {
  candidatesOf,
  grantsOf,
  groupAccess,
  matchesAccess,
  mixOf,
  sameSet,
  statsOf,
  toTerritoryAccess,
} from "./access-view";

const user = (over: Partial<User>): User => ({
  id: "u",
  username: "u",
  email: "u@x",
  status: "active",
  totpEnabled: null,
  passkeyEnabled: null,
  totpRequired: false,
  roleSlugs: [],
  roleTitles: {},
  isOwner: false,
  ...over,
});
const USERS = [
  user({ id: "u-1", username: "a.ivanova", roleSlugs: ["editor"], roleTitles: { editor: "Editor" } }),
  user({ id: "u-2", username: "k.petrov", status: "frozen" }),
  user({ id: "u-3", username: "m.orlova", roleSlugs: ["guest"], roleTitles: { guest: "Guest" } }),
];
const T = {
  slug: "refinery-block-c",
  title: "Refinery Block C",
  sourceBlobHash: "a".repeat(64),
  updatedAt: "2026-08-29T00:00:00Z",
};
const item = (over: Partial<TerritoryAccess> = {}): TerritoryAccess => ({
  slug: "t",
  title: "T",
  visibility: "assigned",
  meta: "t",
  faces: [],
  peopleLabel: "1 person",
  ...over,
});

describe("toTerritoryAccess", () => {
  it("is assigned with admins, naming up to four faces and counting people", () => {
    expect(toTerritoryAccess(T, ["u-1", "u-2", "u-9"], USERS)).toEqual({
      slug: "refinery-block-c",
      title: "Refinery Block C",
      visibility: "assigned",
      meta: "refinery-block-c · upd. 29.08",
      faces: ["a.ivanova", "k.petrov", "u-9"],
      peopleLabel: "3 people",
    });
    expect(toTerritoryAccess(T, ["u-1", "u-2", "u-3", "u-9", "u-10"], USERS).faces).toHaveLength(4);
  });

  it("is private with nobody, worded owner only, and the meta is the slug without a date", () => {
    expect(toTerritoryAccess({ ...T, updatedAt: undefined }, [], USERS)).toEqual({
      slug: "refinery-block-c",
      title: "Refinery Block C",
      visibility: "private",
      meta: "refinery-block-c",
      faces: [],
      peopleLabel: "owner only",
    });
    expect(toTerritoryAccess(T, ["u-1"], USERS).peopleLabel).toBe("1 person");
  });
});

describe("grantsOf", () => {
  it("names each id, dims a frozen or unknown account, and every grant is direct", () => {
    expect(grantsOf(["u-1", "u-2", "u-9"], USERS)).toEqual([
      { userId: "u-1", username: "a.ivanova", roleTitle: "Editor", via: "direct" },
      { userId: "u-2", username: "k.petrov", roleTitle: "—", via: "direct", inactive: true },
      { userId: "u-9", username: "u-9", roleTitle: "—", via: "direct", inactive: true },
    ]);
  });
});

describe("matchesAccess", () => {
  it("narrows by visibility, by a person's name and by free text", () => {
    const grants = grantsOf(["u-1"], USERS);
    const shared = item({ slug: "refinery", title: "Refinery Block C" });
    expect(matchesAccess(shared, grants, "visibility:assigned")).toBe(true);
    expect(matchesAccess(shared, grants, "visibility:private")).toBe(false);
    expect(matchesAccess(shared, grants, "person:ivanova")).toBe(true);
    expect(matchesAccess(shared, grants, "person:petrov")).toBe(false);
    expect(matchesAccess(shared, grants, "refinery block")).toBe(true);
    expect(matchesAccess(shared, grants, "colour:blue")).toBe(true);
  });
});

describe("groupAccess, mixOf, statsOf", () => {
  it("splits shared from not shared and counts distinct people", () => {
    const items = [item({ slug: "a" }), item({ slug: "b", visibility: "private" }), item({ slug: "c" })];
    expect(groupAccess(items).map((g) => [g.key, g.label, g.note, g.territories.map((t) => t.slug)])).toEqual([
      ["shared", "Shared", "2 territories", ["a", "c"]],
      ["not-shared", "Not shared", "1 territory", ["b"]],
    ]);
    expect(mixOf(items)).toEqual({
      label: "Access mix",
      detail: "3 territories",
      segments: [
        { tone: "accent", value: 2, label: "shared" },
        { tone: "neutral", value: 1, label: "not shared" },
      ],
    });
    expect(statsOf(items, { a: ["u-1", "u-2"], b: [], c: ["u-2"] })).toEqual([
      { label: "Territories", value: "3", hint: "2 shared" },
      { label: "Not shared", value: "1", hint: "only Root can open", tone: "warn" },
      { label: "People with access", value: "2", hint: "distinct accounts" },
    ]);
  });
});

describe("drafts", () => {
  it("compares sets regardless of order and offers only active accounts not yet in the draft", () => {
    expect(sameSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameSet(["a"], ["a", "b"])).toBe(false);
    expect(candidatesOf(USERS, ["u-1"]).map((p) => p.id)).toEqual(["u-3"]);
    expect(candidatesOf(USERS, ["u-1"])[0]).toEqual({ id: "u-3", username: "m.orlova", hint: "Guest" });
    const withRoot = [...USERS, user({ id: "u-4", username: "admin", isOwner: true })];
    expect(candidatesOf(withRoot, ["u-1"]).map((p) => p.id)).toEqual(["u-3"]);
  });
});
