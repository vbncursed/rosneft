import { describe, expect, it } from "vitest";
import { passkeysQuery } from "./passkeys-query";

describe("passkeysQuery", () => {
  it("keys on passkeys so a mutation can invalidate it by name", () => {
    expect(passkeysQuery.queryKey).toEqual(["passkeys"]);
  });
});
