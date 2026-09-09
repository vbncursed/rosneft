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
    expect(twoFactor).toMatchObject({ value: "Off", badge: "off", tone: "neutral" });
  });

  // A failed status query is not "off" — claiming a factor is disabled when we
  // could not ask is the one wrong answer here.
  it("admits it does not know rather than reporting off", () => {
    const [twoFactor] = postureCards(null, 2);
    expect(twoFactor).toMatchObject({ value: "—", badge: "unknown", tone: "neutral" });
  });

  it("counts the passkeys it was given, and marks none as a gap", () => {
    expect(postureCards(on, 3)[1]).toMatchObject({ value: "3", badge: "ok", tone: "ok" });
    expect(postureCards(on, 0)[1]).toMatchObject({ value: "0", badge: "none", tone: "neutral" });
    expect(postureCards(on, null)[1]).toMatchObject({ value: "—", badge: "unknown", tone: "neutral" });
  });

  // `dim` on this card measures 3.35:1 dark / 3.09:1 light against panel-2 —
  // under the 4.5:1 floor for 9px text. `neutral` takes the outlined chrome
  // the Password card already wears: text-muted over the card's own ground,
  // 6.82:1 dark / 5.69:1 light. No off/unknown state may carry `dim`.
  it("never reports an off or unknown factor in a tone that cannot be read", () => {
    const tones = [
      ...postureCards(off, 0),
      ...postureCards(null, null),
    ].map((card) => card.tone);
    expect(tones).not.toContain("dim");
  });

  // The hint is part of the same answer as the value and the badge. One fixed
  // sentence described the factor being on and was printed under "Off" and
  // under "—" as well: two of the three states read as a lie.
  it("describes what two-factor does when it is on, and what its absence means when it is off", () => {
    expect(postureCards(on, 2)[0]!.hint).toBe(
      "Every sign-in asks for a code from your authenticator app.",
    );
    expect(postureCards(off, 2)[0]!.hint).toBe(
      "Your password alone signs you in — no second factor is asked for.",
    );
    expect(postureCards(null, 2)[0]!.hint).toBe("We could not read the two-factor status just now.");
  });

  it("does the same for passkeys, including admitting it could not find out", () => {
    expect(postureCards(on, 3)[1]!.hint).toBe(
      "These devices sign you in with the unlock they already use.",
    );
    expect(postureCards(on, 0)[1]!.hint).toBe(
      "No device is registered, so nothing signs you in without your password.",
    );
    expect(postureCards(on, null)[1]!.hint).toBe(
      "We could not read your registered passkeys just now.",
    );
  });

  it("always reports the password as a set fallback", () => {
    expect(postureCards(null, null)[2]).toMatchObject({
      label: "Password", value: "Set", badge: "fallback", tone: "neutral",
    });
  });
});
