import { describe, expect, it } from "vitest";
import {
  batchMix,
  batchStats,
  canRun,
  currentRowStages,
  currentStats,
  isBusy,
  makeRow,
  MODEL_CHECKLIST,
  type QueueRow,
  type RowStatus,
} from "./batch";

const file = (name: string, size = 1024): File => {
  const f = new File([new Uint8Array(Math.min(size, 16))], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
};

const row = (over: Partial<QueueRow> = {}): QueueRow => ({
  id: "r1",
  file: file("a.zip"),
  title: "A",
  status: "queued",
  progress: 0,
  ...over,
});

describe("makeRow", () => {
  it("guesses the title from the filename and starts queued", () => {
    const r = makeRow(file("pump-jack-unit.zip"));
    expect(r.title).toBe("pump-jack-unit");
    expect(r.status).toBe("queued");
    expect(r.progress).toBe(0);
    expect(r.file.name).toBe("pump-jack-unit.zip");
  });

  it("gives every row its own id", () => {
    const a = makeRow(file("a.zip"));
    const b = makeRow(file("a.zip"));
    expect(a.id).not.toBe(b.id);
  });
});

describe("isBusy", () => {
  it("is true only for the three in-flight statuses", () => {
    const statuses: RowStatus[] = ["queued", "uploading", "finalizing", "creating", "done", "failed"];
    expect(statuses.map(isBusy)).toEqual([false, true, true, true, false, false]);
  });
});

describe("batchMix", () => {
  it("buckets done/busy/queued/failed into four coverage segments", () => {
    const rows = [
      row({ id: "1", status: "done" }),
      row({ id: "2", status: "done" }),
      row({ id: "3", status: "uploading" }),
      row({ id: "4", status: "queued" }),
      row({ id: "5", status: "failed" }),
    ];
    expect(batchMix(rows)).toEqual([
      { tone: "ok", value: 2, label: "done" },
      { tone: "accent", value: 1, label: "uploading" },
      { tone: "neutral", value: 1, label: "queued" },
      { tone: "bad", value: 1, label: "failed" },
    ]);
  });

  it("counts finalizing and creating rows as busy alongside uploading", () => {
    const rows = [row({ status: "finalizing" }), row({ status: "creating" })];
    const mix = batchMix(rows);
    expect(mix.find((s) => s.label === "uploading")?.value).toBe(2);
  });
});

describe("batchStats", () => {
  it("counts archives, sums bytes, and counts failures", () => {
    const rows = [
      row({ file: file("a.zip", 38 * 1024 * 1024) }),
      row({ file: file("b.zip", 96 * 1024 * 1024), status: "failed" }),
    ];
    const stats = batchStats(rows);
    expect(stats.archives).toBe("2");
    expect(stats.total).toBe("134 MB total");
    expect(stats.failed).toBe(1);
  });

  it("reads zero archives and zero bytes for an empty batch", () => {
    expect(batchStats([])).toEqual({ archives: "0", total: "0 B total", failed: 0 });
  });
});

describe("canRun", () => {
  it("is true with a queued row and every non-done title filled in", () => {
    expect(canRun([row({ status: "queued", title: "A" })], false)).toBe(true);
  });

  it("is false while a batch is already running", () => {
    expect(canRun([row({ status: "queued" })], true)).toBe(false);
  });

  it("is false with nothing queued or failed to run", () => {
    expect(canRun([row({ status: "done" })], false)).toBe(false);
  });

  it("retries a failed row alongside a queued one", () => {
    expect(canRun([row({ id: "1", status: "failed" }), row({ id: "2", status: "queued" })], false)).toBe(
      true,
    );
  });

  it("is false when a queued row's title is blank", () => {
    expect(canRun([row({ status: "queued", title: "  " })], false)).toBe(false);
  });

  it("ignores a blank title on a row that already finished", () => {
    expect(
      canRun(
        [row({ id: "1", status: "done", title: "" }), row({ id: "2", status: "queued", title: "B" })],
        false,
      ),
    ).toBe(true);
  });
});

describe("currentRowStages", () => {
  it("leaves every stage pending, chunked upload untimed, before it starts", () => {
    const stages = currentRowStages(row({ status: "queued" }));
    expect(stages.map((s) => s.state)).toEqual(["pending", "pending", "pending", "pending"]);
    expect(stages.map((s) => s.label)).toEqual([
      "Chunked upload",
      "Finalize blob",
      "Upload thumbnail",
      "Create model + queue job",
    ]);
  });

  it("activates chunked upload with its own percentage while uploading", () => {
    const stages = currentRowStages(row({ status: "uploading", progress: 0.62 }));
    expect(stages[0]).toMatchObject({ state: "active", time: "62%" });
    expect(stages.slice(1).map((s) => s.state)).toEqual(["pending", "pending", "pending"]);
  });

  it("marks chunked upload done and activates finalize while finalizing", () => {
    const stages = currentRowStages(row({ status: "finalizing" }));
    expect(stages[0].state).toBe("done");
    expect(stages[1]).toMatchObject({ state: "active", time: "running" });
    expect(stages.slice(2).map((s) => s.state)).toEqual(["pending", "pending"]);
  });

  it("activates the thumbnail stage while creating, when a thumbnail was picked", () => {
    const stages = currentRowStages(row({ status: "creating", thumbnail: file("t.png") }));
    expect(stages.slice(0, 2).map((s) => s.state)).toEqual(["done", "done"]);
    expect(stages[2]).toMatchObject({ state: "active", time: "running" });
    expect(stages[3].state).toBe("pending");
  });

  it("skips straight to create model while creating, with no thumbnail to upload — and says so", () => {
    const stages = currentRowStages(row({ status: "creating" }));
    expect(stages.slice(0, 3).map((s) => s.state)).toEqual(["done", "done", "done"]);
    expect(stages[2].time).toBe("skipped");
    expect(stages[3]).toMatchObject({ state: "active", time: "running" });
  });

  it("marks every stage done once the row is done, thumbnail included when one was attached", () => {
    const stages = currentRowStages(row({ status: "done", thumbnail: file("t.png") }));
    expect(stages.map((s) => s.state)).toEqual(["done", "done", "done", "done"]);
    expect(stages[2].time).toBe("done");
  });

  it("says the thumbnail step was skipped, not done, on a finished row with no thumbnail", () => {
    const stages = currentRowStages(row({ status: "done" }));
    expect(stages[2]).toMatchObject({ state: "done", time: "skipped" });
  });
});

describe("currentStats", () => {
  it("reports the chunk count and a dash speed with fewer than two samples", () => {
    const stats = currentStats({ bytes: 0, total: 1_000_000, chunk: 0, chunks: 1 }, [], false);
    expect(stats).toEqual({ chunk: "0 / 1", speed: "—" });
  });

  it("computes speed from the two most recent samples and marks the thumbnail attached", () => {
    const stats = currentStats(
      { bytes: 500_000, total: 1_000_000, chunk: 1, chunks: 2 },
      [
        { at: 0, bytes: 0 },
        { at: 1000, bytes: 500_000 },
      ],
      true,
    );
    expect(stats).toEqual({ chunk: "1 / 2", speed: "488 KB/s", thumbnail: "attached" });
  });
});

describe("MODEL_CHECKLIST", () => {
  it("marks the archive and title rules ok and the thumbnail/origin rules not", () => {
    expect(MODEL_CHECKLIST.map((c) => c.ok)).toEqual([true, true, false, false]);
  });
});
