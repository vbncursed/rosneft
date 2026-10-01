import { afterEach, describe, expect, it } from "vitest";
import { desktopBridge, type DesktopBridge } from "./desktop";

describe("desktopBridge", () => {
  afterEach(() => {
    delete window.desktop;
  });
  it("is undefined in a browser", () => expect(desktopBridge()).toBeUndefined());
  it("is the shell's bridge inside the desktop app", () => {
    const bridge = { passkeys: false } as DesktopBridge;
    window.desktop = bridge;
    expect(desktopBridge()).toBe(bridge);
  });
});
