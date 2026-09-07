import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
import { clearNotices, useNotices } from "@/shared/lib/notify";
import { useModelDetail } from "./use-model-detail";

const { getModel, updateModel, deleteModel, listArtifacts, listJobs, runChunkedUpload, navigate } =
  vi.hoisted(() => ({
    getModel: vi.fn(),
    updateModel: vi.fn(),
    deleteModel: vi.fn(),
    listArtifacts: vi.fn(),
    listJobs: vi.fn(),
    runChunkedUpload: vi.fn(),
    navigate: vi.fn(),
  }));
vi.mock("@/entities/model", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getModel,
  updateModel,
  deleteModel,
}));
vi.mock("@/entities/content", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listArtifacts,
}));
vi.mock("@/entities/conversion", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listJobs,
}));
vi.mock("@/entities/upload", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  runChunkedUpload,
}));
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
  permissions: ["model:write", "model:delete"],
  isOwner: false,
  onboardingToursSeen: [],
};

const MODEL = { slug: "valve", title: "Valve", sourceBlobHash: "a".repeat(64), usageCount: 2 };
const ARTIFACT = {
  lod: 0,
  hash: "h0",
  size: 1024,
  faces: 100,
  vertices: 200,
  bboxMin: { x: 0, y: 0, z: 0 },
  bboxMax: { x: 1, y: 1, z: 1 },
};

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["me"], PRINCIPAL);
  getModel.mockReset().mockResolvedValue(MODEL);
  updateModel.mockReset().mockResolvedValue(MODEL);
  deleteModel.mockReset().mockResolvedValue(undefined);
  listArtifacts.mockReset().mockResolvedValue([ARTIFACT]);
  listJobs.mockReset().mockResolvedValue([]);
  runChunkedUpload.mockReset();
  navigate.mockReset();
  clearNotices();
});

describe("useModelDetail", () => {
  it("resolves ready with the model, artifacts and conversion status once every query answers", async () => {
    const { result } = renderHook(() => useModelDetail("valve"), { wrapper });
    expect(result.current.phase).toBe("loading");
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    if (result.current.phase !== "ready") throw new Error("unreachable");
    expect(result.current.model).toEqual(MODEL);
    expect(result.current.artifacts).toEqual([ARTIFACT]);
    expect(result.current.status).toBe("ready");
  });

  it("reads a live model job for this slug as converting, and a failed one as failed with its message", async () => {
    listJobs.mockResolvedValue([
      { kind: "model", slug: "valve", status: "running", progress: 0.4, stage: "encoding", errorMessage: null },
    ]);
    const { result } = renderHook(() => useModelDetail("valve"), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    if (result.current.phase !== "ready") throw new Error("unreachable");
    expect(result.current.status).toBe("converting");
  });

  it("reads a failed job as failed, carrying its message", async () => {
    listJobs.mockResolvedValue([
      { kind: "model", slug: "valve", status: "failed", progress: null, stage: null, errorMessage: "bad zip" },
    ]);
    const { result } = renderHook(() => useModelDetail("valve"), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    if (result.current.phase !== "ready") throw new Error("unreachable");
    expect(result.current.status).toBe("failed");
    expect(result.current.jobError).toBe("bad zip");
  });

  it("reads usageCount off the model itself — the gateway sends it now", async () => {
    // 5 is distinct from MODEL's own usageCount (2) and from anything a list
    // endpoint could supply — a merge that fell back to (or preferred) a list
    // value would read 2 here, not 5.
    getModel.mockResolvedValue({ ...MODEL, usageCount: 5 });
    const { result } = renderHook(() => useModelDetail("valve"), { wrapper });

    await waitFor(() => expect(result.current.phase).toBe("ready"));
    if (result.current.phase !== "ready") throw new Error("unreachable");
    expect(result.current.model.usageCount).toBe(5);
  });

  it("reports missing on a 404", async () => {
    getModel.mockRejectedValue(new HttpError(404, null, "Model not found"));
    const { result } = renderHook(() => useModelDetail("valve"), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("missing"));
  });

  it("reports unavailable on any other unanswered error", async () => {
    getModel.mockRejectedValue(new HttpError(500, null, "boom"));
    const { result } = renderHook(() => useModelDetail("valve"), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("unavailable"));
  });

  it("confirms the delete, invalidates the list and leaves for the library", async () => {
    const { result } = renderHook(() => useModelDetail("valve"), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    const ready = result.current;
    if (ready.phase !== "ready") throw new Error("unreachable");
    act(() => ready.onDelete());
    expect(result.current.phase === "ready" && result.current.pending).toBe(true);

    const invalidate = vi.spyOn(client, "invalidateQueries");
    act(() => ready.confirm());
    await waitFor(() => expect(deleteModel).toHaveBeenCalledWith("valve"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/models" }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["models"] });
  });

  it("uploads a chosen thumbnail through runChunkedUpload, then patches the model", async () => {
    let resolveUpload: ((r: { hash: string; size: number }) => void) | undefined;
    runChunkedUpload.mockImplementation(
      () => new Promise((resolve) => { resolveUpload = resolve; }),
    );
    const { result } = renderHook(() => useModelDetail("valve"), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    const ready = result.current;
    if (ready.phase !== "ready") throw new Error("unreachable");

    const file = new File([new Uint8Array(4)], "thumb.png");
    act(() => ready.onThumbnail(file));
    await waitFor(() => expect(result.current.phase === "ready" && result.current.thumbnailBusy).toBe(true));
    expect(runChunkedUpload).toHaveBeenCalledWith(file, {});

    await act(async () => resolveUpload?.({ hash: "new-hash", size: 10 }));
    await waitFor(() => expect(updateModel).toHaveBeenCalledWith("valve", { thumbnailBlobHash: "new-hash" }));
    await waitFor(() => expect(result.current.phase === "ready" && result.current.thumbnailBusy).toBe(false));
  });

  it("removes the thumbnail with an empty hash, no upload involved", async () => {
    const { result } = renderHook(() => useModelDetail("valve"), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    const ready = result.current;
    if (ready.phase !== "ready") throw new Error("unreachable");
    act(() => ready.onRemoveThumbnail());
    await waitFor(() => expect(updateModel).toHaveBeenCalledWith("valve", { thumbnailBlobHash: "" }));
    expect(runChunkedUpload).not.toHaveBeenCalled();
  });

  it("toasts a rejected thumbnail update and clears thumbnailBusy", async () => {
    updateModel.mockRejectedValue(new HttpError(422, null, "Quota exceeded"));
    const { result } = renderHook(() => ({ s: useModelDetail("valve"), notices: useNotices() }), { wrapper });
    await waitFor(() => expect(result.current.s.phase).toBe("ready"));
    const ready = result.current.s;
    if (ready.phase !== "ready") throw new Error("unreachable");
    act(() => ready.onRemoveThumbnail());
    await waitFor(() => expect(result.current.notices).toHaveLength(1));
    expect(result.current.notices[0]?.tone).toBe("error");
    expect(result.current.s.phase === "ready" && result.current.s.thumbnailBusy).toBe(false);
  });

  it("follows model:delete and model:write on the principal", async () => {
    client.setQueryData(["me"], { ...PRINCIPAL, permissions: [] });
    const { result } = renderHook(() => useModelDetail("valve"), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe("ready"));
    if (result.current.phase !== "ready") throw new Error("unreachable");
    expect(result.current.canDelete).toBe(false);
    expect(result.current.canWrite).toBe(false);
  });
});
