import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkExport } from "@/entities/territory";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useTerritoryExport } from "./use-territory-export";

vi.mock("@/entities/territory", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  checkExport: vi.fn(),
}));

const exporter = () => renderHook(() => ({ s: useTerritoryExport("ust-kut"), notices: useNotices() }));
const messages = (r: { current: { notices: readonly { message: string }[] } }) =>
  r.current.notices.map((n) => n.message);

let click: ReturnType<typeof vi.spyOn>;
let hrefs: string[];
let names: (string | null)[];
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.mocked(checkExport).mockReset();
  clearNotices();
  hrefs = [];
  names = [];
  click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    hrefs.push(this.getAttribute("href") ?? "");
    names.push(this.getAttribute("download"));
    expect(this.isConnected).toBe(true);
  });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  click.mockRestore();
  vi.unstubAllGlobals();
});

describe("useTerritoryExport", () => {
  it.each([
    ["compressed", "/api/territories/ust-kut/export.glb"],
    ["compatible", "/api/territories/ust-kut/export.glb?variant=compatible"],
    ["obj", "/api/territories/ust-kut/export.obj.zip"],
  ] as const)("%s: a passed check clicks one anchor to %s and fetches nothing", async (variant, href) => {
    vi.mocked(checkExport).mockResolvedValue({ filename: "ust-kut.glb", sizeBytes: 3 * 1_048_576 });
    const { result } = exporter();
    act(() => result.current.s.run(variant));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(checkExport).toHaveBeenCalledWith("ust-kut", variant);
    expect(hrefs).toEqual([href]);
    expect(names).toEqual(["ust-kut.glb"]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("announces the started download with its name and size", async () => {
    vi.mocked(checkExport).mockResolvedValue({ filename: "ust-kut.glb", sizeBytes: 3 * 1_048_576 });
    const { result } = exporter();
    act(() => result.current.s.run("compressed"));
    await waitFor(() => expect(messages(result)).toHaveLength(1));
    expect(messages(result)[0]).toContain("Download started: ust-kut.glb (3 MB)");
    expect(messages(result)[0]).toContain("browser's downloads");
  });

  it("leaves the size out when the check reports none (chunked OBJ)", async () => {
    vi.mocked(checkExport).mockResolvedValue({ filename: "ust-kut-obj.zip" });
    const { result } = exporter();
    act(() => result.current.s.run("obj"));
    await waitFor(() => expect(messages(result)).toHaveLength(1));
    expect(messages(result)[0]).toMatch(/^Download started: ust-kut-obj\.zip — /);
    expect(messages(result)[0]).not.toContain("(");
  });

  it.each([
    [409, "compatible copy is not ready yet"],
    [422, "scene is over the vertex ceiling"],
    [503, "Export failed"], // messageOf never shows a 5xx body
  ])("a %i check shows %s and downloads nothing", async (status, message) => {
    vi.mocked(checkExport).mockRejectedValue(new HttpError(status, null, status < 500 ? message : "internal error"));
    const { result } = exporter();
    act(() => result.current.s.run("compatible"));
    await waitFor(() => expect(messages(result)).toContain(message));
    expect(click).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.s.busy).toBe(false));
  });

  it("falls back to a generic notice when the network fails", async () => {
    vi.mocked(checkExport).mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = exporter();
    act(() => result.current.s.run("compressed"));
    await waitFor(() => expect(messages(result)).toContain("Export failed"));
    expect(click).not.toHaveBeenCalled();
  });

  it("is busy while the check is pending and idle right after the click", async () => {
    let resolve!: (v: { filename: string }) => void;
    vi.mocked(checkExport).mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = exporter();
    expect(result.current.s.busy).toBe(false);
    act(() => result.current.s.run("compressed"));
    await waitFor(() => expect(result.current.s.busy).toBe(true));
    await act(async () => resolve({ filename: "ust-kut.glb" }));
    await waitFor(() => expect(result.current.s.busy).toBe(false));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("ignores a second press while the first check is running", async () => {
    let resolve!: (v: { filename: string }) => void;
    vi.mocked(checkExport).mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = exporter();
    act(() => {
      result.current.s.run("compressed");
      result.current.s.run("obj");
    });
    await act(async () => resolve({ filename: "ust-kut.glb" }));
    expect(checkExport).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
  });
});
