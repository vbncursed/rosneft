import { describe, expect, it, vi } from "vitest";
import { attachPermissionPolicy, attachWindowPolicy, permissionAllowed, permissionCheckAllowed } from "./window-policy";

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
    // Electron hands the check handler the origin with a trailing slash.
    ["clipboard-sanitized-write", `${ORIGIN}/`, true, true],
    ["clipboard-sanitized-write", ORIGIN, true, true],
    ["clipboard-sanitized-write", `${ORIGIN}/`, false, false],
    ["clipboard-sanitized-write", `${ORIGIN}/`, undefined, false],
    ["clipboard-sanitized-write", "https://evil.example/", true, false],
    ["clipboard-read", `${ORIGIN}/`, true, false],
  ])("%s from %s mainFrame=%s -> %s", (permission, from, isMainFrame, want) => {
    expect(permissionCheckAllowed(permission, from, { isMainFrame }, ORIGIN)).toBe(want);
  });
});

describe("attachPermissionPolicy", () => {
  function wire() {
    let request!: (wc: null, p: string, cb: (ok: boolean) => void, d: object) => void;
    let check!: (wc: null, p: string, o: string, d: object) => boolean;
    attachPermissionPolicy(
      {
        setPermissionRequestHandler: (h: typeof request) => void (request = h),
        setPermissionCheckHandler: (h: typeof check) => void (check = h),
      } as never,
      ORIGIN,
    );
    const ask = (p: string, d: object) => {
      const cb = vi.fn();
      request(null, p, cb, d);
      return cb.mock.calls[0]![0] as boolean;
    };
    return { ask, check: (p: string, o: string, d: object) => check(null, p, o, d) };
  }
  const clip = "clipboard-sanitized-write";
  const main = { requestingUrl: `${ORIGIN}/a`, isMainFrame: true };

  it("grants a main-frame same-origin clipboard request and check", () => {
    const w = wire();
    expect(w.ask(clip, main)).toBe(true);
    expect(w.check(clip, `${ORIGIN}/`, main)).toBe(true);
  });
  it("denies a sub-frame", () => {
    const w = wire();
    expect(w.ask(clip, { ...main, isMainFrame: false })).toBe(false);
    expect(w.check(clip, `${ORIGIN}/`, { ...main, isMainFrame: false })).toBe(false);
  });
  it("denies a foreign origin", () => {
    const w = wire();
    expect(w.ask(clip, { requestingUrl: "https://evil.example/", isMainFrame: true })).toBe(false);
    expect(w.check(clip, "https://evil.example/", main)).toBe(false);
  });
  it("denies any other permission", () => {
    const w = wire();
    expect(w.ask("media", main)).toBe(false);
    expect(w.check("media", ORIGIN, main)).toBe(false);
  });
});
