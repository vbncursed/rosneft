import { describe, expect, it } from "vitest";
import { postureCards } from "./posture";

const on = { enabled: true, enabledAt: "2026-08-12T09:20:00Z", recoveryRemaining: 7, recoveryTotal: 10 };
const off = { enabled: false, enabledAt: null, recoveryRemaining: 0, recoveryTotal: 0 };

describe("postureCards", () => {
  it("names the factor in use when 2FA is on", () => {
    const [twoFactor] = postureCards(on, 2);
    expect(twoFactor).toMatchObject({ label: "Two-factor", value: "TOTP", badge: "on", tone: "ok" });
  });

  it("says so plainly when 2FA is off", () => {
    const [twoFactor] = postureCards(off, 2);
    expect(twoFactor).toMatchObject({ value: "Off", badge: "off", tone: "dim" });
  });

  // A failed status query is not "off" — claiming a factor is disabled when we
  // could not ask is the one wrong answer here.
  it("admits it does not know rather than reporting off", () => {
    const [twoFactor] = postureCards(null, 2);
    expect(twoFactor).toMatchObject({ value: "—", badge: "unknown", tone: "dim" });
  });

  it("counts the passkeys it was given, and marks none as a gap", () => {
    expect(postureCards(on, 3)[1]).toMatchObject({ value: "3", badge: "ok", tone: "ok" });
    expect(postureCards(on, 0)[1]).toMatchObject({ value: "0", badge: "none", tone: "dim" });
    expect(postureCards(on, null)[1]).toMatchObject({ value: "—", badge: "unknown", tone: "dim" });
  });

  it("always reports the password as a set fallback", () => {
    expect(postureCards(null, null)[2]).toMatchObject({
      label: "Password", value: "Set", badge: "fallback", tone: "neutral",
    });
  });
});
