import { describe, expect, it } from "vitest";
import { twoFactorQuery } from "./two-factor-query";

describe("twoFactorQuery", () => {
  it("keys on two-factor so every 2FA flow can invalidate it by name", () => {
    expect(twoFactorQuery.queryKey).toEqual(["two-factor"]);
  });
});
