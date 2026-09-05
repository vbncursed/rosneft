import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useUploadModels } from "./use-upload-models";

const { runChunkedUpload, createModel, leaveTo, navigate } = vi.hoisted(() => ({
  runChunkedUpload: vi.fn(),
  createModel: vi.fn(),
  leaveTo: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/entities/upload", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runChunkedUpload,
}));
vi.mock("@/entities/model", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createModel,
}));
vi.mock("@/shared/lib/leave", () => ({ leaveTo }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useNavigate: () => navigate,
}));

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
  permissions: ["model:write"],
  isOwner: false,
  onboardingToursSeen: [],
};

const file = (name: string, size = 1024): File => {
  const f = new File([new Uint8Array(16)], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
};

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], PRINCIPAL);
  runChunkedUpload.mockReset();
  createModel.mockReset();
  leaveTo.mockReset();
  navigate.mockReset();
  clearNotices();
});

describe("useUploadModels", () => {
  it("starts with an empty queue, idle", () => {
    const { result } = renderHook(() => useUploadModels(), { wrapper });
    expect(result.current.rows).toEqual([]);
    expect(result.current.running).toBe(false);
    expect(result.current.canUpload).toBe(true);
  });

  it("turns dropped files into queued rows", () => {
    const { result } = renderHook(() => useUploadModels(), { wrapper });
    act(() => result.current.onFiles([file("pump-jack-unit.zip"), file("storage-tank-500.zip")]));
    expect(result.current.rows.map((r) => r.title)).toEqual(["pump-jack-unit", "storage-tank-500"]);
    expect(result.current.rows.every((r) => r.status === "queued")).toBe(true);
  });

  it("edits a row's title and removes a non-busy row", () => {
    const { result } = renderHook(() => useUploadModels(), { wrapper });
    act(() => result.current.onFiles([file("a.zip")]));
    const id = result.current.rows[0].id;
    act(() => result.current.onTitle(id, "Custom Title"));
    expect(result.current.rows[0].title).toBe("Custom Title");
    act(() => result.current.onRemove(id));
    expect(result.current.rows).toHaveLength(0);
  });

  it("clears only the done rows, keeping the rest", async () => {
    runChunkedUpload.mockResolvedValue({ hash: "h", size: 1 });
    createModel.mockResolvedValue({ model: { slug: "a", title: "A" }, job: { id: "j" } });
    const { result } = renderHook(() => useUploadModels(), { wrapper });
    act(() => result.current.onFiles([file("a.zip")]));
    act(() => result.current.onTitle(result.current.rows[0].id, "A"));
    act(() => result.current.onRun());
    await waitFor(() => expect(result.current.rows[0]?.status).toBe("done"));

    act(() => result.current.onFiles([file("b.zip")]));
    act(() => result.current.onClearDone());
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].file.name).toBe("b.zip");
  });

  it("runs rows sequentially, uploads the thumbnail before creating, and toasts on a failure without stopping the batch", async () => {
    runChunkedUpload.mockImplementation((f: File) =>
      Promise.resolve({ hash: f.name === "b.zip" ? "fail" : `hash-${f.name}`, size: f.size }),
    );
    createModel.mockImplementation(({ sourceBlobHash }: { sourceBlobHash: string }) => {
      if (sourceBlobHash === "fail") return Promise.reject(new HttpError(422, null, "bad archive"));
      return Promise.resolve({ model: { slug: "a", title: "A" }, job: { id: "job-a" } });
    });

    const { result } = renderHook(
      () => ({ s: useUploadModels(), notices: useNotices() }),
      { wrapper },
    );
    act(() => result.current.s.onFiles([file("a.zip"), file("b.zip")]));
    const [a, b] = result.current.s.rows;
    act(() => result.current.s.onTitle(a.id, "A"));
    act(() => result.current.s.onTitle(b.id, "B"));

    act(() => result.current.s.onRun());
    await waitFor(() => expect(result.current.s.running).toBe(false));

    expect(result.current.s.rows.find((r) => r.id === a.id)?.status).toBe("done");
    expect(result.current.s.rows.find((r) => r.id === b.id)?.status).toBe("failed");
    expect(result.current.notices[0]?.message).toBe("b.zip: bad archive");
    expect(createModel).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith("/models/a?jobId=job-a"));
  });

  it("uploads the thumbnail before creating the model", async () => {
    runChunkedUpload.mockImplementation((f: File) => Promise.resolve({ hash: `hash-${f.name}`, size: f.size }));
    createModel.mockResolvedValue({ model: { slug: "a", title: "A" }, job: { id: "job-a" } });

    const { result } = renderHook(() => useUploadModels(), { wrapper });
    act(() => result.current.onFiles([file("a.zip")]));
    const id = result.current.rows[0].id;
    act(() => result.current.onTitle(id, "A"));
    act(() => result.current.onThumbnail(id, file("thumb.png", 512)));

    act(() => result.current.onRun());
    await waitFor(() => expect(leaveTo).toHaveBeenCalled());

    expect(runChunkedUpload).toHaveBeenCalledWith(expect.objectContaining({ name: "thumb.png" }), expect.anything());
    expect(createModel).toHaveBeenCalledWith(
      expect.objectContaining({ sourceBlobHash: "hash-a.zip", thumbnailBlobHash: "hash-thumb.png" }),
    );
  });

  it("navigates to the model library when several rows are created", async () => {
    let n = 0;
    runChunkedUpload.mockImplementation((f: File) => Promise.resolve({ hash: `h-${f.name}`, size: f.size }));
    createModel.mockImplementation(() => {
      n += 1;
      return Promise.resolve({ model: { slug: `m${n}`, title: "M" }, job: { id: `j${n}` } });
    });

    const { result } = renderHook(() => useUploadModels(), { wrapper });
    act(() => result.current.onFiles([file("a.zip"), file("b.zip")]));
    const [a, b] = result.current.rows;
    act(() => result.current.onTitle(a.id, "A"));
    act(() => result.current.onTitle(b.id, "B"));

    act(() => result.current.onRun());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/models" }));
    expect(leaveTo).not.toHaveBeenCalled();
  });

  it("stays put when nothing is created", async () => {
    runChunkedUpload.mockRejectedValue(new Error("network drop"));
    const { result } = renderHook(() => useUploadModels(), { wrapper });
    act(() => result.current.onFiles([file("a.zip")]));
    act(() => result.current.onTitle(result.current.rows[0].id, "A"));

    act(() => result.current.onRun());
    await waitFor(() => expect(result.current.running).toBe(false));
    expect(leaveTo).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(result.current.rows[0].status).toBe("failed");
  });

  it("does nothing when canRun is false", () => {
    const { result } = renderHook(() => useUploadModels(), { wrapper });
    act(() => result.current.onRun());
    expect(runChunkedUpload).not.toHaveBeenCalled();
    expect(result.current.running).toBe(false);
  });

  it("cancels the current row without a toast, and stops the loop", async () => {
    let signal: AbortSignal | undefined;
    runChunkedUpload.mockImplementation(
      (_f: File, opts: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = opts.signal;
          opts.signal?.addEventListener("abort", () => reject(new Error("upload aborted")));
        }),
    );
    const { result } = renderHook(
      () => ({ s: useUploadModels(), notices: useNotices() }),
      { wrapper },
    );
    act(() => result.current.s.onFiles([file("a.zip"), file("b.zip")]));
    const [a, b] = result.current.s.rows;
    act(() => result.current.s.onTitle(a.id, "A"));
    act(() => result.current.s.onTitle(b.id, "B"));

    act(() => result.current.s.onRun());
    await waitFor(() => expect(result.current.s.rows.find((r) => r.id === a.id)?.status).toBe("uploading"));

    act(() => result.current.s.onCancel());
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.s.running).toBe(false));

    expect(result.current.s.rows.find((r) => r.id === a.id)).toMatchObject({
      status: "failed",
      error: "cancelled",
    });
    // The loop stopped: b never started.
    expect(result.current.s.rows.find((r) => r.id === b.id)?.status).toBe("queued");
    expect(result.current.notices).toHaveLength(0);
  });

  it("reports the currently processing row and its stats while running", async () => {
    let reportProgress: ((p: { bytes: number; total: number; chunk: number; chunks: number }) => void) | undefined;
    runChunkedUpload.mockImplementation((_f: File, opts: { onProgress?: typeof reportProgress }) => {
      reportProgress = opts.onProgress;
      return new Promise(() => {});
    });
    const { result } = renderHook(() => useUploadModels(), { wrapper });
    act(() => result.current.onFiles([file("a.zip", 1_000_000)]));
    act(() => result.current.onTitle(result.current.rows[0].id, "A"));

    act(() => result.current.onRun());
    expect(result.current.current).toBeUndefined();

    act(() => reportProgress?.({ bytes: 500_000, total: 1_000_000, chunk: 1, chunks: 2 }));
    expect(result.current.current?.row.status).toBe("uploading");
    expect(result.current.current?.stats.chunk).toBe("1 / 2");
  });

  it("moves the current row to finalizing when the upload reports that stage", async () => {
    let reportStage: ((s: string) => void) | undefined;
    runChunkedUpload.mockImplementation((_f: File, opts: { onStage?: typeof reportStage }) => {
      reportStage = opts.onStage;
      return new Promise(() => {});
    });
    const { result } = renderHook(() => useUploadModels(), { wrapper });
    act(() => result.current.onFiles([file("a.zip")]));
    act(() => result.current.onTitle(result.current.rows[0].id, "A"));
    act(() => result.current.onRun());

    act(() => reportStage?.("initiating"));
    expect(result.current.rows[0].status).toBe("uploading");

    act(() => reportStage?.("finalizing"));
    expect(result.current.rows[0].status).toBe("finalizing");
  });

  it("says the whole page needs model:write when the viewer lacks the grant", () => {
    client.setQueryData(["me"], { ...PRINCIPAL, permissions: [] });
    const { result } = renderHook(() => useUploadModels(), { wrapper });
    expect(result.current.canUpload).toBe(false);
  });

  it("lists failed rows by file name", async () => {
    runChunkedUpload.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useUploadModels(), { wrapper });
    act(() => result.current.onFiles([file("bad.zip")]));
    act(() => result.current.onTitle(result.current.rows[0].id, "Bad"));
    act(() => result.current.onRun());
    await waitFor(() => expect(result.current.failedNames).toEqual(["bad.zip"]));
  });
});
