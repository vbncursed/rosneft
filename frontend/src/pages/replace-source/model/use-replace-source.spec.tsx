import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useReplaceSource, type ReplaceSourceState } from "./use-replace-source";

const { getTerritory, replaceTerritorySource, assetSize, runChunkedUpload, navigate } = vi.hoisted(
  () => ({
    getTerritory: vi.fn(),
    replaceTerritorySource: vi.fn(),
    assetSize: vi.fn(),
    runChunkedUpload: vi.fn(),
    navigate: vi.fn(),
  }),
);
vi.mock("@/entities/territory", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTerritory,
  replaceTerritorySource,
}));
vi.mock("@/entities/content", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  assetSize,
}));
vi.mock("@/entities/upload", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runChunkedUpload,
}));
// A stand-in for the router context: the hook is rendered on its own.
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

const PRINCIPAL = {
  id: "me",
  email: "me@x",
  username: "me",
  status: "active",
  totpEnabled: true,
  totpRequired: false,
  passkeyEnabled: null,
  roleSlugs: ["editor"],
  roleTitles: { editor: "Editor" },
  permissions: ["territory:write"],
  isOwner: false,
  onboardingToursSeen: [],
};

const TERRITORY = {
  slug: "t",
  title: "T",
  sourceBlobHash: "h".repeat(64),
  placementCount: 0,
  createdAt: "2026-09-02T00:00:00Z",
};

const file = () => new File([new Uint8Array(1024)], "rev4.zip");

/** Narrows the union for the test body — every case here is asserted to have reached "ready" first. */
function ready(state: ReplaceSourceState) {
  if (state.status !== "ready") throw new Error(`expected ready, got ${state.status}`);
  return state;
}

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], PRINCIPAL);
  getTerritory.mockReset().mockResolvedValue(TERRITORY);
  replaceTerritorySource.mockReset();
  assetSize.mockReset().mockResolvedValue(1024);
  runChunkedUpload.mockReset();
  navigate.mockReset();
  clearNotices();
});

describe("useReplaceSource", () => {
  it("loads until the territory and its size answer, then reads ready and idle", async () => {
    const { result } = renderHook(() => useReplaceSource("t"), { wrapper });
    expect(result.current.status).toBe("loading");

    await waitFor(() => expect(result.current.status).toBe("ready"));
    const s = ready(result.current);
    expect(s.territory).toEqual(TERRITORY);
    expect(s.currentSize).toBe(1024);
    expect(s.phase).toBe("idle");
  });

  it("picks a file, and replacing it reverts to idle", async () => {
    const { result } = renderHook(() => useReplaceSource("t"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => ready(result.current).onFiles([file()]));
    expect(ready(result.current).phase).toBe("picked");

    act(() => ready(result.current).onReplace());
    expect(ready(result.current).phase).toBe("idle");
  });

  it("runs picked -> uploading -> finalizing -> replacing -> navigates to the conversion page, invalidating jobs and territories", async () => {
    runChunkedUpload.mockImplementation((_file, opts) => {
      opts.onStage?.("finalizing");
      return Promise.resolve({ hash: "n".repeat(64), size: 2048 });
    });
    replaceTerritorySource.mockResolvedValue({ territory: { slug: "t" }, job: { id: "j-9" } });

    const { result } = renderHook(() => useReplaceSource("t"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => ready(result.current).onFiles([file()]));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    act(() => ready(result.current).onSubmit());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ href: "/territories/t?jobId=j-9" }));
    expect(replaceTerritorySource).toHaveBeenCalledWith("t", "n".repeat(64));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["jobs"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["territories"] });
  });

  it("toasts a rejected replace and returns to picked, without leaving", async () => {
    runChunkedUpload.mockResolvedValue({ hash: "n".repeat(64), size: 2048 });
    replaceTerritorySource.mockRejectedValue(new Error("nope"));

    const { result } = renderHook(() => ({ s: useReplaceSource("t"), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => ready(result.current.s).onFiles([file()]));
    act(() => ready(result.current.s).onSubmit());

    await waitFor(() => expect(ready(result.current.s).phase).toBe("picked"));
    expect(result.current.notices[0]?.tone).toBe("error");
    expect(navigate).not.toHaveBeenCalled();
  });

  // The navigate is the last link in the promise chain, so it must be returned
  // rather than discarded: a rejected one belongs in the same .catch as a
  // rejected upload, not in an unhandled rejection.
  it("toasts a rejected navigate and returns to picked", async () => {
    runChunkedUpload.mockResolvedValue({ hash: "n".repeat(64), size: 2048 });
    replaceTerritorySource.mockResolvedValue({ territory: { slug: "t" }, job: { id: "j-9" } });
    navigate.mockRejectedValue(new Error("route not found"));

    const { result } = renderHook(() => ({ s: useReplaceSource("t"), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => ready(result.current.s).onFiles([file()]));
    act(() => ready(result.current.s).onSubmit());

    await waitFor(() => expect(result.current.notices[0]?.tone).toBe("error"));
    expect(ready(result.current.s).phase).toBe("picked");
  });

  it("cancels the upload without a toast, returning to picked", async () => {
    runChunkedUpload.mockImplementation(
      (_file, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener("abort", () => reject(new Error("upload aborted")));
        }),
    );
    const { result } = renderHook(() => ({ s: useReplaceSource("t"), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.status).toBe("ready"));
    act(() => ready(result.current.s).onFiles([file()]));
    act(() => ready(result.current.s).onSubmit());
    expect(ready(result.current.s).phase).toBe("uploading");

    act(() => ready(result.current.s).onCancel());
    await waitFor(() => expect(ready(result.current.s).phase).toBe("picked"));
    expect(result.current.notices).toHaveLength(0);
  });

  it("reads a 404 as missing", async () => {
    const { HttpError } = await import("@/shared/api");
    getTerritory.mockRejectedValue(new HttpError(404, null, "territory not found"));
    const { result } = renderHook(() => useReplaceSource("t"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("missing"));
  });

  it("reads any other failure as unavailable, with the gateway's own message", async () => {
    const { HttpError } = await import("@/shared/api");
    getTerritory.mockRejectedValue(new HttpError(503, null, "catalog unreachable"));
    const { result } = renderHook(() => useReplaceSource("t"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.status === "unavailable" && result.current.error).toBe("catalog unreachable");
  });

  it("says the whole page needs territory:write when the viewer lacks the grant", async () => {
    client.setQueryData(["me"], { ...PRINCIPAL, permissions: [] });
    const { result } = renderHook(() => useReplaceSource("t"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(ready(result.current).canReplace).toBe(false);
  });

  it("shows progress only while uploading or finalizing, and a retry starts undefined", async () => {
    let reportProgress: ((p: { bytes: number; total: number; chunk: number; chunks: number }) => void) | undefined;
    runChunkedUpload.mockImplementation(
      (_file, opts) =>
        new Promise((_resolve, reject) => {
          reportProgress = opts.onProgress;
          opts.signal?.addEventListener("abort", () => reject(new Error("upload aborted")));
        }),
    );

    const { result } = renderHook(() => useReplaceSource("t"), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => ready(result.current).onFiles([file()]));
    expect(ready(result.current).progress).toBeUndefined();

    act(() => ready(result.current).onSubmit());
    act(() => reportProgress?.({ bytes: 512, total: 1024, chunk: 1, chunks: 2 }));
    expect(ready(result.current).progress?.value).toBe(50);

    act(() => ready(result.current).onCancel());
    await waitFor(() => expect(ready(result.current).phase).toBe("picked"));

    act(() => ready(result.current).onSubmit());
    expect(ready(result.current).progress).toBeUndefined();
  });
});
