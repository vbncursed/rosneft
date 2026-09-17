import { describe, expect, it } from "vitest";
import { freeText, parseFilters, removeToken } from "./query";

describe("parseFilters", () => {
  it("reads every key:value token", () => {
    expect(parseFilters("entity:territory actor:a.ivanova failed:true")).toEqual([
      { token: "entity:territory", key: "entity", value: "territory" },
      { token: "actor:a.ivanova", key: "actor", value: "a.ivanova" },
      { token: "failed:true", key: "failed", value: "true" },
    ]);
  });

  it("keeps a dotted value whole", () => {
    expect(parseFilters("actor:a.ivanova")[0].value).toBe("a.ivanova");
  });

  it("ignores free text", () => {
    expect(parseFilters("refinery block")).toEqual([]);
    expect(parseFilters("refinery entity:territory")).toHaveLength(1);
  });

  it("makes no chip out of half-typed input", () => {
    expect(parseFilters("entity:")).toEqual([]);
    expect(parseFilters(":territory")).toEqual([]);
    expect(parseFilters("entity")).toEqual([]);
  });

  it("copes with extra whitespace and an empty query", () => {
    expect(parseFilters("  entity:territory   actor:x  ")).toHaveLength(2);
    expect(parseFilters("")).toEqual([]);
    expect(parseFilters("   ")).toEqual([]);
  });
});

describe("removeToken", () => {
  it("drops the named token and leaves the rest", () => {
    expect(removeToken("entity:territory actor:x failed:true", "actor:x")).toBe(
      "entity:territory failed:true",
    );
  });

  it("leaves a query that does not contain the token alone", () => {
    expect(removeToken("entity:territory", "actor:x")).toBe("entity:territory");
  });

  it("normalises whitespace as it goes", () => {
    expect(removeToken("  a:1   b:2  ", "a:1")).toBe("b:2");
  });

  it("removes every copy of a repeated token", () => {
    expect(removeToken("a:1 b:2 a:1", "a:1")).toBe("b:2");
  });
});

describe("freeText", () => {
  it("returns what is left once the tokens are taken out", () => {
    expect(freeText("refinery entity:territory block")).toBe("refinery block");
  });

  it("is empty when the query is all tokens", () => {
    expect(freeText("entity:territory actor:x")).toBe("");
  });

  it("keeps half-typed input, which is not a token yet", () => {
    expect(freeText("entity:")).toBe("entity:");
  });

  // parseFilters reads this as grants=users:write; the two must agree on what
  // a token is, or the value is filtered on *and* searched for as text.
  it("drops a token whose value carries a colon of its own", () => {
    expect(freeText("grants:users:write")).toBe("");
  });
});
