import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/shared/api";
import { useTerritoryConversion } from "./use-territory-conversion";

const { getTerritory, listArtifacts, listJobs, useJobStream, leaveTo } = vi.hoisted(() => ({
  getTerritory: vi.fn(),
  listArtifacts: vi.fn(),
  listJobs: vi.fn(),
  useJobStream: vi.fn(),
  leaveTo: vi.fn(),
}));
vi.mock("@/entities/territory", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getTerritory,
}));
vi.mock("@/entities/content", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listArtifacts,
}));
vi.mock("@/entities/conversion", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listJobs,
  useJobStream,
}));
vi.mock("@/shared/lib/leave", () => ({ leaveTo }));

const TERRITORY = { slug: "t", title: "Tenant A", sourceBlobHash: "a".repeat(64), placementCount: 0 };
const LOD0 = { lod: 0, hash: "h0", size: 1, faces: 1, vertices: 1, bboxMin: { x: 0, y: 0, z: 0 }, bboxMax: { x: 1, y: 1, z: 1 } };
const RUNNING = { kind: "territory", slug: "t", status: "running", progress: 0.4, stage: "parsing", errorMessage: null };
const FAILED = { kind: "territory", slug: "t", status: "failed", progress: null, stage: null, errorMessage: "blob not found" };

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
// A fresh client per mount: two mounts in one test are two page loads, and a
// shared cache would answer the second one with the first one's rows.
const render = (jobId: string | null = null) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useTerritoryConversion("t", jobId), { wrapper });
};
const ready = async (r: ReturnType<typeof render>) => {
  await waitFor(() => expect(r.result.current.status).toBe("ready"));
  const s = r.result.current;
  if (s.status !== "ready") throw new Error("not ready");
  return s;
};

describe("useTerritoryConversion", () => {
  beforeEach(() => {
    getTerritory.mockReset().mockResolvedValue(TERRITORY);
    listArtifacts.mockReset().mockResolvedValue([]);
    listJobs.mockReset().mockResolvedValue([]);
    useJobStream.mockReset().mockReturnValue(null);
    leaveTo.mockReset();
  });

  it("is loading until all three have answered, then queued with no record and no artifacts", async () => {
    const r = render();
    expect(r.result.current.status).toBe("loading");
    const s = await ready(r);
    expect(s.phase).toBe("queued");
    expect(s.job).toBeNull();
    expect(s.hasLod0).toBe(false);
    expect(s.territory).toEqual(TERRITORY);
  });

  it("is missing on a 404, unavailable on any other first failure", async () => {
    getTerritory.mockRejectedValue(new HttpError(404, null, "Territory not found"));
    const r = render();
    await waitFor(() => expect(r.result.current.status).toBe("missing"));

    getTerritory.mockResolvedValue(TERRITORY);
    // messageOf only surfaces an HttpError's own message; a bare Error reads as the generic sentence.
    listJobs.mockRejectedValue(new HttpError(503, null, "jobs down"));
    const r2 = render();
    await waitFor(() => expect(r2.result.current).toEqual({ status: "unavailable", error: "jobs down" }));
  });

  it("reads the phase off the polled row: running, and failed with the worker's message", async () => {
    listJobs.mockResolvedValue([RUNNING]);
    expect((await ready(render())).phase).toBe("running");

    listJobs.mockResolvedValue([FAILED]);
    listArtifacts.mockResolvedValue([LOD0]);
    const s = await ready(render());
    expect(s.phase).toBe("failed");
    expect(s.job?.errorMessage).toBe("blob not found");
    expect(s.hasLod0).toBe(true);
  });

  it("lets the stream outrank the poll once it has answered", async () => {
    listJobs.mockResolvedValue([{ ...RUNNING, progress: 0.1 }]);
    useJobStream.mockReturnValue({ ...RUNNING, progress: 0.9 });
    const s = await ready(render("j1"));
    expect(useJobStream).toHaveBeenCalledWith("j1", "t");
    expect(s.job?.progress).toBe(0.9);

    // The terminal frame lands a round trip before the artifacts do; the page
    // must draw the last step rather than flash back to "queued".
    useJobStream.mockReturnValue({ ...RUNNING, status: "succeeded", stage: "registering", progress: 1 });
    expect((await ready(render("j1"))).phase).toBe("running");
  });

  it("does not leave on a mount that is already ready", async () => {
    listArtifacts.mockResolvedValue([LOD0]);
    const s = await ready(render());
    expect(s.phase).toBe("ready");
    expect(leaveTo).not.toHaveBeenCalled();
    s.onOpenViewer();
    expect(leaveTo).toHaveBeenCalledWith("/territories/t");
  });

  it("leaves for the viewer when a running conversion finishes on this page", async () => {
    listJobs.mockResolvedValue([RUNNING]);
    const r = render();
    expect((await ready(r)).phase).toBe("running");

    listJobs.mockResolvedValue([]);
    listArtifacts.mockResolvedValue([LOD0]);
    await client.refetchQueries({ queryKey: ["jobs"] });
    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith("/territories/t"));
    expect(listArtifacts).toHaveBeenCalledTimes(2); // finishedSince re-read the artifacts
  });

  // A territory with no job row and no LOD0 is waiting for the reconciler to
  // queue one; the catalog's pollInterval has nothing live to poll on, so the
  // page overrides it or the promise "this page opens the viewer by itself"
  // is never kept.
  const jobsRefetchInterval = () => {
    const q = client.getQueryCache().find({ queryKey: ["jobs"] })!;
    // refetchInterval lives on the observer's options, which QueryOptions does not declare.
    const interval = (q.options as { refetchInterval?: unknown }).refetchInterval;
    return typeof interval === "function" ? (interval(q) as number | false) : interval;
  };

  it("polls while it waits for a job that does not exist yet, and stops once a LOD0 lands", async () => {
    await ready(render());
    expect(jobsRefetchInterval()).toBe(5000);

    listArtifacts.mockResolvedValue([LOD0]);
    await ready(render());
    expect(jobsRefetchInterval()).toBe(false);

    listArtifacts.mockResolvedValue([]);
    listJobs.mockResolvedValue([RUNNING]);
    await ready(render());
    expect(jobsRefetchInterval()).toBe(5000);
  });

  it("keeps the page when a background refetch fails", async () => {
    listJobs.mockResolvedValue([RUNNING]);
    const r = render();
    await ready(r);
    listJobs.mockRejectedValue(new Error("blip"));
    await client.refetchQueries({ queryKey: ["jobs"] });
    expect(r.result.current.status).toBe("ready");
  });
});
