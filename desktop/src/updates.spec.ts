import { describe, expect, it, vi } from "vitest";
import { createUpdateChecker, newerRelease, scheduleUpdateChecks, type UpdateDeps } from "./updates";

const checkForUpdates = (deps: UpdateDeps) => createUpdateChecker(deps)();

const rel = (tag: string, extra: object = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  html_url: `https://github.com/vbncursed/rosneft/releases/tag/${tag}`,
  ...extra,
});
const url = (v: string) => `https://github.com/vbncursed/rosneft/releases/tag/desktop-v${v}`;

describe("newerRelease", () => {
  const cases: [string, string, unknown, string | null][] = [
    ["older", "0.3.1", [rel("desktop-v0.3.0")], null],
    ["equal", "0.3.1", [rel("desktop-v0.3.1")], null],
    ["newer", "0.3.1", [rel("desktop-v0.3.2")], "0.3.2"],
    ["numeric, not lexical", "0.9.0", [rel("desktop-v0.10.0")], "0.10.0"],
    ["highest of several", "0.3.1", [rel("desktop-v0.4.0"), rel("desktop-v1.0.0"), rel("desktop-v0.5.0")], "1.0.0"],
    ["prerelease", "0.3.1", [rel("desktop-v0.4.0", { prerelease: true })], null],
    ["draft", "0.3.1", [rel("desktop-v0.4.0", { draft: true })], null],
    ["other tag", "0.3.1", [rel("v1.2.3"), rel("desktop-v1.2")], null],
    ["malformed item", "0.3.1", [null, 5, "x", { tag_name: 1 }, rel("desktop-v0.4.0", { html_url: 3 })], null],
    ["non-array", "0.3.1", { message: "rate limited" }, null],
    ["empty", "0.3.1", [], null],
  ];
  it.each(cases)("%s", (_n, current, releases, want) => {
    expect(newerRelease(current, releases)?.version ?? null).toBe(want);
  });
  it("returns the page url", () => {
    expect(newerRelease("0.3.1", [rel("desktop-v0.4.0")])?.url).toBe(url("0.4.0"));
  });
});

function setup(
  over: Partial<UpdateDeps> = {},
  body: unknown = [rel("desktop-v0.4.0")],
  dismissed: string | null = null,
) {
  const deps = {
    fetch: vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    settings: { value: { dismissedUpdate: dismissed }, update: vi.fn(async () => {}) },
    showDialog: vi.fn(async () => 1),
    openExternal: vi.fn(async () => {}),
    currentVersion: "0.3.1",
    ...over,
  };
  return deps as typeof deps & UpdateDeps;
}

describe("checkForUpdates", () => {
  it("asks GitHub for the releases and shows a dialog for a newer one", async () => {
    const d = setup();
    await checkForUpdates(d);
    expect(d.fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/vbncursed/rosneft/releases?per_page=20",
      expect.objectContaining({ headers: { Accept: "application/vnd.github+json" } }),
    );
    expect(d.showDialog).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(d.showDialog).mock.calls[0])).toContain("0.4.0");
  });
  it("Download opens the release page", async () => {
    const d = setup({ showDialog: vi.fn(async () => 0) });
    await checkForUpdates(d);
    expect(d.openExternal).toHaveBeenCalledWith(url("0.4.0"));
  });
  it("Later remembers the version", async () => {
    const d = setup();
    await checkForUpdates(d);
    expect(d.settings.update).toHaveBeenCalledWith({ dismissedUpdate: "0.4.0" });
    expect(d.openExternal).not.toHaveBeenCalled();
  });
  it("stays quiet for the dismissed version", async () => {
    const d = setup({}, [rel("desktop-v0.4.0")], "0.4.0");
    await checkForUpdates(d);
    expect(d.showDialog).not.toHaveBeenCalled();
  });
  it("prompts again for a version newer than the dismissed one", async () => {
    const d = setup({}, [rel("desktop-v0.5.0")], "0.4.0");
    await checkForUpdates(d);
    expect(d.showDialog).toHaveBeenCalledOnce();
  });
  it("is silent when fetch rejects, answers 403 or returns bad JSON", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const f of [
      vi.fn(async () => Promise.reject(new Error("offline"))),
      vi.fn(async () => new Response("{}", { status: 403 })),
      vi.fn(async () => new Response("not json", { status: 200 })),
    ]) {
      const d = setup({ fetch: f });
      await checkForUpdates(d);
      expect(d.showDialog).not.toHaveBeenCalled();
    }
  });
  it("does not open a non-github url", async () => {
    const bad = rel("desktop-v0.4.0", { html_url: "https://evil.example/x" });
    const d = setup({ showDialog: vi.fn(async () => 0) }, [bad]);
    await checkForUpdates(d);
    expect(d.openExternal).not.toHaveBeenCalled();
  });
  it("does not stack a second dialog while one is open", async () => {
    let close!: (n: number) => void;
    const d = setup({ showDialog: vi.fn(() => new Promise<number>((r) => (close = r))) });
    const check = createUpdateChecker(d);
    const first = check();
    const second = check();
    await vi.waitFor(() => expect(d.showDialog).toHaveBeenCalled());
    close(1);
    await Promise.all([first, second]);
    expect(d.showDialog).toHaveBeenCalledOnce();
  });
});

describe("hung network", () => {
  it("aborts the request so a later check can run", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise<Response>((_res, rej) => init.signal.addEventListener("abort", () => rej(new Error("aborted")))),
      )
      .mockImplementation(async () => new Response("[]"));
    const check = createUpdateChecker(setup({ fetch }));
    const first = check();
    await vi.advanceTimersByTimeAsync(15_000);
    await first;
    await check();
    vi.useRealTimers();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("logs the status of a non-2xx answer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await checkForUpdates(setup({ fetch: vi.fn(async () => new Response("{}", { status: 403 })) }));
    expect(warn).toHaveBeenCalledWith("update check: HTTP", 403);
  });
});

const fake = () => {
  const unref = vi.fn();
  return { setTimeout: vi.fn(() => ({ unref })), setInterval: vi.fn(() => ({ unref })), check: vi.fn(), unref };
};

describe("scheduleUpdateChecks", () => {
  it("schedules nothing when not packaged", () => {
    const f = fake();
    scheduleUpdateChecks({ ...f, packaged: false });
    expect(f.setTimeout).not.toHaveBeenCalled();
    expect(f.setInterval).not.toHaveBeenCalled();
  });
  it("checks after 30 s then every 6 h, without holding the process open", () => {
    const f = fake();
    scheduleUpdateChecks({ ...f, packaged: true });
    expect(f.setTimeout).toHaveBeenCalledWith(expect.any(Function), 30_000);
    expect(f.setInterval).toHaveBeenCalledWith(expect.any(Function), 21_600_000);
    expect(f.unref).toHaveBeenCalledTimes(2);
  });
});
