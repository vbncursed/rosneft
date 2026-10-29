import { describe, expect, it } from "vitest";
import { checked, reasonOf, SaveFailure } from "./offline-errors";

describe("reasonOf", () => {
  it.each([
    [new SaveFailure("signed-out"), "signed-out"],
    [Object.assign(new Error("x"), { code: "ENOSPC" }), "no-space"],
    [new Error("net::ERR_INTERNET_DISCONNECTED"), "network"],
    [new Error("boom"), "failed"],
  ])("%s", (err, reason) => expect(reasonOf(err)).toBe(reason));
});

describe("checked", () => {
  it("passes 200, maps 401 to signed-out and anything else to failed", () => {
    const res = new Response("", { status: 200 });
    expect(checked(res)).toBe(res);
    expect(() => checked(new Response("", { status: 401 }))).toThrow(expect.objectContaining({ reason: "signed-out" }));
    expect(() => checked(new Response("", { status: 500 }))).toThrow(expect.objectContaining({ reason: "failed" }));
  });
});
