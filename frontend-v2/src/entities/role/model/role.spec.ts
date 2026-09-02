import { describe, expect, it } from "vitest";
import { grantLabel, grantShare, isEditable, usersLabel, type Role } from "./role";

const role = (over: Partial<Role> = {}): Role => ({
  slug: "field-operator",
  title: "Field Operator",
  kind: "custom",
  grants: 6,
  users: 11,
  updated: "upd. 29.08",
  ...over,
});

describe("isEditable", () => {
  it("lets a custom role be edited and a system one not", () => {
    expect(isEditable(role())).toBe(true);
    expect(isEditable(role({ kind: "system" }))).toBe(false);
  });
});

describe("grantShare", () => {
  it("gives the share of the whole permission set", () => {
    expect(grantShare(role({ grants: 6 }), 15)).toBe(40);
    expect(grantShare(role({ grants: 15 }), 15)).toBe(100);
    expect(grantShare(role({ grants: 0 }), 15)).toBe(0);
  });

  it("returns zero when no permissions are defined at all", () => {
    expect(grantShare(role(), 0)).toBe(0);
  });

  it("never exceeds the whole, even if the counts disagree", () => {
    expect(grantShare(role({ grants: 20 }), 15)).toBe(100);
  });
});

describe("grantLabel", () => {
  it("reads as a fraction of the whole set", () => {
    expect(grantLabel(role({ grants: 6 }), 15)).toBe("6/15");
  });
});

describe("usersLabel", () => {
  it("agrees with itself in number", () => {
    expect(usersLabel(role({ users: 1 }))).toBe("1 user");
    expect(usersLabel(role({ users: 11 }))).toBe("11 users");
    expect(usersLabel(role({ users: 0 }))).toBe("0 users");
  });
});
