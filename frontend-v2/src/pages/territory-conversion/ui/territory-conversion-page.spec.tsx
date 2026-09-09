import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TargetJob } from "@/entities/conversion";
import type { TerritoryConversionPageProps } from "../model/conversion-view";
import { TerritoryConversionPage, WAITING_NOTE } from "./territory-conversion-page";

const TERRITORY = { slug: "refinery-block-c", title: "Refinery Block C", sourceBlobHash: "a".repeat(64), placementCount: 0 };
const job = (over: Partial<TargetJob> = {}): TargetJob => ({
  kind: "territory", slug: "refinery-block-c", status: "running", progress: 0.58, stage: "lod-1", errorMessage: null, ...over,
});
const props = (over: Partial<TerritoryConversionPageProps> = {}): TerritoryConversionPageProps => ({
  territory: TERRITORY, phase: "running", job: job(), hasLod0: false, onOpenViewer: vi.fn(), ...over,
});

describe("TerritoryConversionPage", () => {
  it("draws the header: back link, eyebrow, title, the state pill, the meta line", () => {
    render(<TerritoryConversionPage {...props()} />);
    expect(screen.getByRole("link", { name: "← Territory catalog" })).toHaveAttribute("href", "/territories");
    expect(screen.getByText("Converting")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Refinery Block C" })).toBeInTheDocument();
    expect(screen.getByText("converting")).toBeInTheDocument();
    expect(screen.getByText("territory · refinery-block-c")).toBeInTheDocument();
  });

  it("running: the stage and percent over the bar, the pipeline at step 6, the waiting note", () => {
    render(<TerritoryConversionPage {...props()} />);
    expect(screen.getByRole("progressbar", { name: "Conversion progress" })).toHaveAttribute("aria-valuenow", "58");
    expect(screen.getByText("Building LOD 1")).toBeInTheDocument();
    expect(screen.getByText("58%")).toBeInTheDocument();
    expect(screen.getByText("step 6 of 7")).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: "Conversion pipeline" })).getAllByRole("listitem");
    expect(within(items[5]).getByText("running")).toBeInTheDocument();
    expect(screen.getByText(WAITING_NOTE)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("queued: no bar, the waiting card, and the honest lede for a territory with no record", () => {
    render(<TerritoryConversionPage {...props({ phase: "queued", job: null })} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for a worker")).toBeInTheDocument();
    expect(screen.getByText("no progress reported")).toBeInTheDocument();
    expect(screen.getByText("queued")).toBeInTheDocument();
    expect(screen.getByText(/no job has been recorded/)).toBeInTheDocument();
    expect(screen.getByText("7 steps · none started")).toBeInTheDocument();
  });

  it("failed: the worker's message as an alert, the stopped step, the actions, no waiting note", () => {
    render(
      <TerritoryConversionPage
        {...props({ phase: "failed", job: job({ status: "failed", stage: "compressing", progress: null, errorMessage: "ktx2: bad" }) })}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Worker message")).toBeInTheDocument();
    expect(within(alert).getByText("ktx2: bad")).toBeInTheDocument();
    expect(screen.getByText("stopped at step 5 of 7")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upload a new source" })).toBeInTheDocument();
    expect(screen.queryByText(WAITING_NOTE)).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("failed with no message and no stage — the live shape", () => {
    render(
      <TerritoryConversionPage
        {...props({ phase: "failed", job: job({ status: "failed", stage: null, progress: null, errorMessage: null }) })}
      />,
    );
    expect(screen.getByText("The worker reported no message.")).toBeInTheDocument();
    expect(screen.getByText("stopped before the first report")).toBeInTheDocument();
  });

  it("falls back for an empty worker message, as the gateway's *string can serialise it", () => {
    render(
      <TerritoryConversionPage
        {...props({ phase: "failed", job: job({ status: "failed", stage: null, progress: null, errorMessage: "" }) })}
      />,
    );
    expect(screen.getByText("The worker reported no message.")).toBeInTheDocument();
  });

  it("titles the pipeline section with a real heading", () => {
    render(<TerritoryConversionPage {...props()} />);
    expect(screen.getByRole("heading", { level: 2, name: "Pipeline" })).toBeInTheDocument();
  });

  it("draws a zero-percent bar rather than dropping it", () => {
    render(<TerritoryConversionPage {...props({ job: job({ progress: 0 }) })} />);
    expect(screen.getByRole("progressbar", { name: "Conversion progress" })).toHaveAttribute("aria-valuenow", "0");
  });

  it("ready: the ok pill, a finished pipeline, the viewer button", () => {
    render(<TerritoryConversionPage {...props({ phase: "ready", job: null, hasLod0: true })} />);
    // The eyebrow answers the state; "Converting" over a finished page is a lie.
    expect(screen.getByText("Converted")).toBeInTheDocument();
    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(screen.getByText("7 steps · finished")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open the viewer" })).toBeInTheDocument();
    expect(screen.queryByText(WAITING_NOTE)).not.toBeInTheDocument();
  });
});
