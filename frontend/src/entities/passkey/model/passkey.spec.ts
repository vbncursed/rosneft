import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "@/shared/lib/desktop";
import { isPasskeySupported, passkeyMeta } from "./passkey";

vi.mock("@github/webauthn-json", () => ({ supported: () => true }));

describe("isPasskeySupported", () => {
  afterEach(() => {
    delete window.desktop;
  });

  it("is true in a browser that can run the ceremony", () => {
    expect(isPasskeySupported()).toBe(true);
  });

  it("is false inside the desktop shell when this OS has no working ceremony", () => {
    window.desktop = { passkeys: false } as DesktopBridge;
    expect(isPasskeySupported()).toBe(false);
  });
  it("is true inside the desktop shell when this OS has one", () => {
    window.desktop = { passkeys: true } as DesktopBridge;
    expect(isPasskeySupported()).toBe(true);
  });
});

const key = { id: "k1", name: "MacBook Pro", createdAt: "2026-08-12T09:20:00Z", lastUsedAt: null };

describe("passkeyMeta", () => {
  it("names the day it was added", () => {
    expect(passkeyMeta(key)).toBe("Added 12.08.2026");
  });

  it("adds the last use only when there was one", () => {
    expect(passkeyMeta({ ...key, lastUsedAt: "2026-09-07T18:02:00Z" })).toBe("Added 12.08.2026 · last used 07.09.2026");
  });

  it("says nothing it cannot read", () => {
    expect(passkeyMeta({ ...key, createdAt: "" })).toBe("Added —");
  });
});
