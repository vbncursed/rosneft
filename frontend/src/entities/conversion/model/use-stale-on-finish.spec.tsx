import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import type { TargetJob } from "./target-job";
import { staleKeysOf, useStaleOnFinish } from "./use-stale-on-finish";

const job = (over: Partial<TargetJob> = {}): TargetJob => ({
  kind: "territory",
  slug: "t",
  status: "running",
  progress: 0.4,
  stage: "parsing",
  errorMessage: null,
  ...over,
});

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
const mount = (jobs: TargetJob[] | undefined, handled: TargetJob | null = null) =>
  renderHook((p: { jobs: TargetJob[] | undefined; handled: TargetJob | null }) => useStaleOnFinish(p.jobs, p.handled), {
    wrapper,
    initialProps: { jobs, handled },
  });

// Every key a finish can touch, seeded fresh so a mark is observable.
const KEYS = [
  ["territories"],
  ["models"],
  ["scene", "t"],
  ["artifacts", "model", "m"],
  ["artifacts", "territory", "t"],
];
const stale = () => KEYS.filter((queryKey) => client.getQueryState(queryKey)?.isInvalidated).map((k) => k.join("/"));

beforeEach(() => {
  client = new QueryClient();
  for (const queryKey of KEYS) client.setQueryData(queryKey, []);
});

describe("staleKeysOf", () => {
  it("names a territory's list and scene bundle, a model's list and artifacts", () => {
    expect(staleKeysOf({ kind: "territory", slug: "t" })).toEqual([["territories"], ["scene", "t"]]);
    expect(staleKeysOf({ kind: "model", slug: "m" })).toEqual([["models"], ["artifacts", "model", "m"]]);
  });
});

describe("useStaleOnFinish", () => {
  it("marks nothing on the first answer — there is no earlier one to compare with", () => {
    mount([job({ status: "succeeded" })]);
    expect(stale()).toEqual([]);
  });

  it("marks a finished territory's list and bundle, never territory artifacts (nothing reads them)", () => {
    const r = mount([job()]);
    r.rerender({ jobs: [], handled: null });
    expect(stale()).toEqual(["territories", "scene/t"]);
  });

  it("marks a finished model's list and artifacts, leaving the territory side alone", () => {
    const r = mount([job({ kind: "model", slug: "m" })]);
    r.rerender({ jobs: [job({ kind: "model", slug: "m", status: "failed" })], handled: null });
    expect(stale()).toEqual(["models", "artifacts/model/m"]);
  });

  it("marks nothing while every job is still live", () => {
    const r = mount([job()]);
    r.rerender({ jobs: [job({ progress: 0.9 })], handled: null });
    expect(stale()).toEqual([]);
  });

  it("skips a finish another channel already handled, and only that one", () => {
    const done = job({ status: "succeeded" });
    const r = mount([job(), job({ kind: "model", slug: "m" })], done);
    r.rerender({ jobs: [], handled: done });
    expect(stale()).toEqual(["models", "artifacts/model/m"]);
  });

  it("waits for an answer: no jobs yet is not an empty list", () => {
    const r = mount([job()]);
    r.rerender({ jobs: undefined, handled: null });
    expect(stale()).toEqual([]);
    r.rerender({ jobs: [], handled: null });
    expect(stale()).toEqual(["territories", "scene/t"]);
  });
});
