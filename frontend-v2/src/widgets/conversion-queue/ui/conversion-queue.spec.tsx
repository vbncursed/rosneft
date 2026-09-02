import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConversionQueue } from "./conversion-queue";
import type { ConversionJob } from "@/entities/conversion";

const JOBS: ConversionJob[] = [
  { id: "1", slug: "terminal-yard-4", state: "running", progress: 62, stage: "Compressing textures…", eta: "~4 min" },
  { id: "2", slug: "pipe-rack-b7", state: "running", progress: 18, stage: "Parsing OBJ…", eta: "~11 min" },
  { id: "3", slug: "flare-stack", state: "failed", progress: 18, stage: "OBJ parse error at line 84120", eta: "—" },
];

describe("ConversionQueue", () => {
  it("lists one row per job", () => {
    render(<ConversionQueue jobs={JOBS} />);
    expect(screen.getByRole("list", { name: "Conversion queue" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("names each job by what is converting, and what it is doing", () => {
    render(<ConversionQueue jobs={JOBS} />);
    expect(screen.getByText("terminal-yard-4")).toBeInTheDocument();
    expect(screen.getByText("Compressing textures…")).toBeInTheDocument();
    expect(screen.getByText("~4 min")).toBeInTheDocument();
  });

  it("reports progress per job", () => {
    render(<ConversionQueue jobs={JOBS} />);
    expect(
      screen.getByRole("progressbar", { name: "terminal-yard-4 conversion" }),
    ).toHaveAttribute("aria-valuenow", "62");
  });

  it("fills a failed job's bar and colours it — it got as far as it will get", () => {
    render(<ConversionQueue jobs={JOBS} />);
    const bar = screen.getByRole("progressbar", { name: "flare-stack conversion" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar.firstElementChild!.className).toContain("bg-bad");
  });

  it("writes each state out as a word", () => {
    render(<ConversionQueue jobs={JOBS} />);
    expect(screen.getAllByText("running")).toHaveLength(2);
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("keeps a queued job indeterminate", () => {
    render(
      <ConversionQueue
        jobs={[{ id: "9", slug: "waiting", state: "queued", stage: "Waiting for a worker…", eta: "—" }]}
      />,
    );
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  });

  it("says the queue is empty rather than showing a bare frame", () => {
    render(<ConversionQueue jobs={[]} />);
    expect(screen.getByText(/Nothing is converting/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
