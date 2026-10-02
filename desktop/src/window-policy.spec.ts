import { describe, expect, it, vi } from "vitest";
import { attachWindowPolicy, permissionAllowed, permissionCheckAllowed } from "./window-policy";

const ORIGIN = "https://andrey.vbncursed.fun";

type Listener = (event: { preventDefault: () => void; isMainFrame?: boolean; url?: string }, url?: string) => void;

function setup() {
  const calls: string[] = [];
  const listeners = new Map<string, Listener>();
  let openHandler!: (d: { url: string }) => { action: string };
  const openExternal = vi.fn((url: string) => void calls.push(`open:${url}`));
  attachWindowPolicy(
    {
      setWindowOpenHandler: (h: typeof openHandler) => void (openHandler = h),
      on: (name: string, l: Listener) => void listeners.set(name, l),
    } as never,
    ORIGIN,
    openExternal,
  );
  const fire = (name: string, url: string, extra: { isMainFrame?: boolean } = {}) => {
    const event = { url, ...extra, preventDefault: vi.fn(() => void calls.push("prevent")) };
    listeners.get(name)!(event, url);
    return event;
  };
  return { calls, openExternal, open: (url: string) => openHandler({ url }), fire };
}

describe("window.open", () => {
  it("hands an off-origin https URL to the OS and denies the window", () => {
    const s = setup();
    expect(s.open("https://example.com/x")).toEqual({ action: "deny" });
    expect(s.openExternal).toHaveBeenCalledWith("https://example.com/x");
  });
  it.each([`${ORIGIN}/a`, "javascript:alert(1)", "file:///etc/passwd"])("denies %s without opening it", (url) => {
    const s = setup();
    expect(s.open(url)).toEqual({ action: "deny" });
    expect(s.openExternal).not.toHaveBeenCalled();
  });
});

describe("will-navigate", () => {
  it("prevents an off-origin navigation, then opens it externally", () => {
    const s = setup();
    s.fire("will-navigate", "https://example.com/");
    expect(s.calls).toEqual(["prevent", "open:https://example.com/"]);
  });
  it("prevents but does not open a file: URL", () => {
    const s = setup();
    s.fire("will-navigate", "file:///etc/passwd");
    expect(s.calls).toEqual(["prevent"]);
  });
  it("leaves a same-origin navigation alone", () => {
    const s = setup();
    expect(s.fire("will-navigate", `${ORIGIN}/a`).preventDefault).not.toHaveBeenCalled();
  });
});

describe("will-redirect", () => {
  it("prevents a main-frame redirect off the origin", () => {
    const s = setup();
    s.fire("will-redirect", "https://evil.example/", { isMainFrame: true });
    expect(s.calls).toEqual(["prevent", "open:https://evil.example/"]);
  });
  it("leaves a sub-frame redirect alone", () => {
    const s = setup();
    expect(
      s.fire("will-redirect", "https://evil.example/", { isMainFrame: false }).preventDefault,
    ).not.toHaveBeenCalled();
  });
  it("leaves a same-origin main-frame redirect alone", () => {
    const s = setup();
    expect(s.fire("will-redirect", `${ORIGIN}/b`, { isMainFrame: true }).preventDefault).not.toHaveBeenCalled();
  });
});

describe("permissionAllowed", () => {
  const main = { requestingUrl: `${ORIGIN}/territories`, isMainFrame: true };
  it.each([
    ["clipboard-sanitized-write", main, true],
    ["clipboard-sanitized-write", { ...main, isMainFrame: false }, false],
    ["clipboard-sanitized-write", { ...main, requestingUrl: "https://evil.example/" }, false],
    ["clipboard-sanitized-write", { isMainFrame: true }, false],
    ["clipboard-read", main, false],
    ["media", main, false],
    ["geolocation", main, false],
  ])("%s %j -> %s", (permission, details, want) => {
    expect(permissionAllowed(permission, details, ORIGIN)).toBe(want);
  });
});

describe("permissionCheckAllowed", () => {
  it.each([
    ["clipboard-sanitized-write", ORIGIN, true],
    ["clipboard-sanitized-write", "https://evil.example", false],
    ["clipboard-read", ORIGIN, false],
  ])("%s from %s -> %s", (permission, from, want) => {
    expect(permissionCheckAllowed(permission, from, ORIGIN)).toBe(want);
  });
});
