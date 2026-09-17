import { describe, expect, it, vi } from "vitest";

vi.mock("./jobs-gateway", () => ({ listJobs: vi.fn(async () => []) }));
const { jobsQuery } = await import("./jobs-query");

describe("jobsQuery", () => {
  it("keys the list, delegates, never polls in the background", async () => {
    expect(jobsQuery.queryKey).toEqual(["jobs"]);
    const run = jobsQuery.queryFn as () => Promise<unknown>;
    await expect(run()).resolves.toEqual([]);
    expect(jobsQuery.refetchIntervalInBackground).toBe(false);
    expect(typeof jobsQuery.refetchInterval).toBe("function");
  });
});
