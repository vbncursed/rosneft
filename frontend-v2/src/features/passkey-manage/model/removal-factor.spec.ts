import { describe, expect, it } from "vitest";
import { removalFactor } from "./removal-factor";

describe("removalFactor", () => {
  it("asks for an authenticator code when 2FA is on", () => {
    expect(removalFactor(true)).toBe("code");
  });

  it("asks for the account password when 2FA is off", () => {
    expect(removalFactor(false)).toBe("password");
  });

  // The tri-state is the whole point: null is "we could not find out", and
  // collecting either field would send a value the gateway throws away before
  // refusing the removal anyway.
  it("collects nothing when the 2FA state is unknown", () => {
    expect(removalFactor(null)).toBe("unavailable");
  });
});
