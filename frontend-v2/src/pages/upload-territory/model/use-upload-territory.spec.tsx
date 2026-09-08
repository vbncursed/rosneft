import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useUploadTerritory } from "./use-upload-territory";

const { runChunkedUpload, createTerritory, navigate } = vi.hoisted(() => ({
  runChunkedUpload: vi.fn(),
  createTerritory: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/entities/upload", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runChunkedUpload,
}));
vi.mock("@/entities/territory", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createTerritory,
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

const file = () => new File([new Uint8Array(1024)], "refinery-block-c.zip");

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], PRINCIPAL);
  runChunkedUpload.mockReset();
  createTerritory.mockReset();
  navigate.mockReset();
  clearNotices();
});

describe("useUploadTerritory", () => {
  it("starts idle, with no file and an empty form", () => {
    const { result } = renderHook(() => useUploadTerritory(), { wrapper });
    expect(result.current.phase).toBe("idle");
    expect(result.current.file).toBeNull();
    expect(result.current.form).toEqual({ title: "", description: "", panoramaUrl: "" });
    expect(result.current.canUpload).toBe(true);
  });

  it("picks a file and previews its slug from the title", () => {
    const { result } = renderHook(() => useUploadTerritory(), { wrapper });
    act(() => result.current.onFiles([file()]));
    expect(result.current.phase).toBe("picked");
    expect(result.current.file?.name).toBe("refinery-block-c.zip");
    act(() => result.current.onForm({ title: "Refinery Block C" }));
    expect(result.current.slug).toBe("refinery-block-c");
  });

  it("replace clears the file and reverts to idle", () => {
    const { result } = renderHook(() => useUploadTerritory(), { wrapper });
    act(() => result.current.onFiles([file()]));
    act(() => result.current.onReplace());
    expect(result.current.file).toBeNull();
    expect(result.current.phase).toBe("idle");
  });

  it("runs picked -> uploading -> creating -> navigates to the territory's conversion page with the job id", async () => {
    let reportProgress: ((p: { bytes: number; total: number; chunk: number; chunks: number }) => void) | undefined;
    runChunkedUpload.mockImplementation((_file, opts) => {
      reportProgress = opts.onProgress;
      opts.onStage?.("finalizing");
      return Promise.resolve({ hash: "h".repeat(64), size: 1024 });
    });
    createTerritory.mockResolvedValue({
      territory: { slug: "refinery-block-c", title: "Refinery Block C" },
      job: { id: "job-1" },
    });

    const { result } = renderHook(() => useUploadTerritory(), { wrapper });
    act(() => result.current.onFiles([file()]));
    act(() => result.current.onForm({ title: "Refinery Block C" }));

    act(() => {
      result.current.onSubmit();
      reportProgress?.({ bytes: 512, total: 1024, chunk: 1, chunks: 1 });
    });
    expect(result.current.phase).toBe("finalizing");

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ href: "/territories/refinery-block-c?jobId=job-1" }),
    );
    expect(createTerritory).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Refinery Block C", sourceBlobHash: "h".repeat(64) }),
    );
  });

  it("does nothing when submitted without a file or a blank title", () => {
    const { result } = renderHook(() => useUploadTerritory(), { wrapper });
    act(() => result.current.onSubmit());
    expect(runChunkedUpload).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("idle");
  });

  it("ignores non-finalizing stage reports — the phase stays uploading", () => {
    let reportStage: ((s: string) => void) | undefined;
    runChunkedUpload.mockImplementation((_file, opts) => {
      reportStage = opts.onStage;
      return new Promise(() => {});
    });
    const { result } = renderHook(() => useUploadTerritory(), { wrapper });
    act(() => result.current.onFiles([file()]));
    act(() => result.current.onForm({ title: "T" }));
    act(() => result.current.onSubmit());
    act(() => reportStage?.("initiating"));
    expect(result.current.phase).toBe("uploading");
  });

  it("does nothing when submitted with a file but a whitespace-only title", () => {
    const { result } = renderHook(() => useUploadTerritory(), { wrapper });
    act(() => result.current.onFiles([file()]));
    act(() => result.current.onForm({ title: "   " }));
    act(() => result.current.onSubmit());
    expect(runChunkedUpload).not.toHaveBeenCalled();
    expect(result.current.phase).toBe("picked");
  });

  it("ignores an empty file list", () => {
    const { result } = renderHook(() => useUploadTerritory(), { wrapper });
    act(() => result.current.onFiles([]));
    expect(result.current.phase).toBe("idle");
    expect(result.current.file).toBeNull();
  });

  it("trims and forwards the optional description and panorama URL", async () => {
    runChunkedUpload.mockResolvedValue({ hash: "h".repeat(64), size: 1 });
    createTerritory.mockResolvedValue({ territory: { slug: "t", title: "T" }, job: { id: "j" } });
    const { result } = renderHook(() => useUploadTerritory(), { wrapper });
    act(() => result.current.onFiles([file()]));
    act(() =>
      result.current.onForm({ title: "T", description: " a scene ", panoramaUrl: " https://x/y " }),
    );
    act(() => result.current.onSubmit());
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(createTerritory).toHaveBeenCalledWith(
      expect.objectContaining({ description: "a scene", externalPanoramaUrl: "https://x/y" }),
    );
  });

  it("toasts the failure and returns to picked with the file kept", async () => {
    runChunkedUpload.mockRejectedValue(new Error("network drop"));
    const { result } = renderHook(() => ({ s: useUploadTerritory(), notices: useNotices() }), { wrapper });
    act(() => result.current.s.onFiles([file()]));
    act(() => result.current.s.onForm({ title: "T" }));
    act(() => result.current.s.onSubmit());

    await waitFor(() => expect(result.current.s.phase).toBe("picked"));
    expect(result.current.s.file).not.toBeNull();
    expect(result.current.notices[0]?.tone).toBe("error");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("cancels the upload without a toast, returning to picked with the file kept", async () => {
    let signal: AbortSignal | undefined;
    runChunkedUpload.mockImplementation(
      (_file, opts) =>
        new Promise((_resolve, reject) => {
          signal = opts.signal;
          opts.signal?.addEventListener("abort", () => reject(new Error("upload aborted")));
        }),
    );
    const { result } = renderHook(() => ({ s: useUploadTerritory(), notices: useNotices() }), { wrapper });
    act(() => result.current.s.onFiles([file()]));
    act(() => result.current.s.onForm({ title: "T" }));
    act(() => result.current.s.onSubmit());
    expect(result.current.s.phase).toBe("uploading");

    act(() => result.current.s.onCancel());
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.s.phase).toBe("picked"));
    expect(result.current.s.file).not.toBeNull();
    expect(result.current.notices).toHaveLength(0);
  });

  it("clears the stale progress from a cancelled attempt before the retry reports its own", async () => {
    let latestOnProgress:
      | ((p: { bytes: number; total: number; chunk: number; chunks: number }) => void)
      | undefined;
    runChunkedUpload.mockImplementation(
      (_file, opts) =>
        new Promise((_resolve, reject) => {
          latestOnProgress = opts.onProgress;
          opts.signal?.addEventListener("abort", () => reject(new Error("upload aborted")));
        }),
    );
    const { result } = renderHook(() => useUploadTerritory(), { wrapper });
    act(() => result.current.onFiles([file()]));
    act(() => result.current.onForm({ title: "T" }));

    act(() => result.current.onSubmit());
    act(() => latestOnProgress?.({ bytes: 512, total: 1024, chunk: 1, chunks: 2 }));
    expect(result.current.progress?.value).toBe(50);

    act(() => result.current.onCancel());
    await waitFor(() => expect(result.current.phase).toBe("picked"));

    act(() => result.current.onSubmit());
    expect(result.current.progress).toBeUndefined();
  });

  it("says the whole page needs territory:write when the viewer lacks the grant", () => {
    client.setQueryData(["me"], { ...PRINCIPAL, permissions: [] });
    const { result } = renderHook(() => useUploadTerritory(), { wrapper });
    expect(result.current.canUpload).toBe(false);
  });
});
