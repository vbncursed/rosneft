import { afterEach, describe, expect, it, vi } from "vitest";
import { isPasskeySupported, passkeyMeta } from "./passkey";

vi.mock("@github/webauthn-json", () => ({ supported: () => true }));

describe("isPasskeySupported", () => {
  afterEach(() => {
    delete window.__DESKTOP__;
  });

  it("is true in a browser that can run the ceremony", () => {
    expect(isPasskeySupported()).toBe(true);
  });

  // The Tauri shell *has* WebAuthn — only its RP origin, a loopback port,
  // is one PASSKEY_RP_ORIGINS will never list. Reporting supported there
  // offers an Add control whose ceremony fails with no server log at all.
  it("is false inside the desktop shell, where the ceremony cannot succeed", () => {
    window.__DESKTOP__ = true;
    expect(isPasskeySupported()).toBe(false);
  });
});

const key = { id: "k1", name: "MacBook Pro", createdAt: "2026-08-12T09:20:00Z", lastUsedAt: null };

describe("passkeyMeta", () => {
  it("names the day it was added", () => {
    expect(passkeyMeta(key)).toBe("Added 12.08.2026");
  });

  it("adds the last use only when there was one", () => {
    expect(passkeyMeta({ ...key, lastUsedAt: "2026-09-07T18:02:00Z" })).toBe(
      "Added 12.08.2026 · last used 07.09.2026",
    );
  });

  it("says nothing it cannot read", () => {
    expect(passkeyMeta({ ...key, createdAt: "" })).toBe("Added —");
  });
});
