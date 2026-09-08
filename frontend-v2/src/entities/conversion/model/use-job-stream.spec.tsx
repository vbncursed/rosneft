import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobStreamHandlers } from "../api/job-stream";
import { useJobStream } from "./use-job-stream";

const { openJobStream, close } = vi.hoisted(() => ({ openJobStream: vi.fn(), close: vi.fn() }));
vi.mock("../api/job-stream", () => ({ openJobStream }));

let handlers: JobStreamHandlers;
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const job = (over: object = {}) => ({
  kind: "territory" as const,
  slug: "t",
  status: "running" as const,
  progress: 0.5,
  stage: "encoding",
  errorMessage: null,
  ...over,
});

describe("useJobStream", () => {
  beforeEach(() => {
    client = new QueryClient();
    openJobStream.mockReset().mockImplementation((_id: string, h: JobStreamHandlers) => {
      handlers = h;
      return close;
    });
    close.mockReset();
  });

  it("subscribes only with an id, and closes on unmount", () => {
    const { unmount, rerender } = renderHook(({ id }) => useJobStream(id, "t"), {
      wrapper,
      initialProps: { id: null as string | null },
    });
    expect(openJobStream).not.toHaveBeenCalled();
    rerender({ id: "j1" });
    expect(openJobStream).toHaveBeenCalledWith("j1", expect.any(Object));
    unmount();
    expect(close).toHaveBeenCalled();
  });

  it("hands back the latest frame for this territory and drops another's", () => {
    const { result } = renderHook(() => useJobStream("j1", "t"), { wrapper });
    act(() => handlers.onJob(job({ slug: "other" })));
    expect(result.current).toBeNull();
    act(() => handlers.onJob(job({ kind: "model", slug: "t" })));
    expect(result.current).toBeNull();
    act(() => handlers.onJob(job()));
    expect(result.current).toEqual(job());
  });

  it("re-reads the artifacts and the jobs list on a terminal frame", () => {
    const spy = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useJobStream("j1", "t"), { wrapper });
    act(() => handlers.onJob(job()));
    expect(spy).not.toHaveBeenCalled();
    act(() => handlers.onJob(job({ status: "succeeded" })));
    expect(spy).toHaveBeenCalledWith({ queryKey: ["artifacts", "territory", "t"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["jobs"] });
  });

  it("forgets its frame when the channel is lost, so the poll's row wins again", () => {
    const { result } = renderHook(() => useJobStream("j1", "t"), { wrapper });
    act(() => handlers.onJob(job()));
    expect(result.current).not.toBeNull();
    act(() => handlers.onEnd("lost"));
    expect(result.current).toBeNull();
  });

  it("keeps a finished frame", () => {
    const { result } = renderHook(() => useJobStream("j1", "t"), { wrapper });
    act(() => handlers.onJob(job({ status: "failed", errorMessage: "boom" })));
    act(() => handlers.onEnd("finished"));
    expect(result.current?.status).toBe("failed");
  });
});
