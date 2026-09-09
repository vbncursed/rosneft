import { describe, expect, it } from "vitest";
import { unanswered } from "./unanswered";

const boom = new Error("boom");

describe("unanswered", () => {
  it("is the error of a query that has never answered", () => {
    expect(unanswered({ data: undefined, error: boom })).toBe(boom);
  });

  it("is null while the query is still waiting", () => {
    expect(unanswered({ data: undefined, error: null })).toBeNull();
  });

  // The one TanStack v5 gets wrong if you read isError: a refetch that trips
  // leaves the data in place, and a populated screen must survive it.
  it("is null when the query holds data, however it failed since", () => {
    expect(unanswered({ data: [], error: boom })).toBeNull();
    expect(unanswered({ data: null, error: boom })).toBeNull();
  });
});
