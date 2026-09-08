import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StageList } from "./stage-list";
import type { ConversionStage } from "../model/status";

const STAGES: ConversionStage[] = [
  { label: "Parsing OBJ", state: "done", time: "1m 12s" },
  { label: "Building LOD 0-1", state: "done", time: "3m 04s" },
  { label: "Compressing textures", state: "active", time: "running" },
  { label: "Building LOD 2", state: "pending", time: "queued" },
];

describe("StageList", () => {
  it("lists every stage in order with its timing", () => {
    render(<StageList stages={STAGES} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent("Parsing OBJ");
    expect(items[0]).toHaveTextContent("1m 12s");
    expect(items[3]).toHaveTextContent("queued");
  });

  it("is a labelled list", () => {
    render(<StageList stages={STAGES} />);
    // list-none drops the implicit role in WebKit; the attribute is what keeps it.
    expect(screen.getByRole("list", { name: "Conversion stages" })).toHaveAttribute("role", "list");
  });

  it("tones each stage by where the pipeline has got to", () => {
    render(<StageList stages={STAGES} />);
    expect(screen.getByText("Parsing OBJ").className).toContain("text-fg");
    expect(screen.getByText("Compressing textures").className).toContain("text-warn");
    expect(screen.getByText("Building LOD 2").className).toContain("text-dim");
  });

  it("renders an empty pipeline as an empty list, not a crash", () => {
    render(<StageList stages={[]} />);
    expect(screen.getByRole("list")).toBeEmptyDOMElement();
  });

  it("renders every row even when two stages share a label, with no duplicate-key warning", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <StageList
        stages={[
          { label: "Upload chunk", state: "done", time: "1m" },
          { label: "Upload chunk", state: "active", time: "running" },
        ]}
      />,
    );
    expect(screen.getAllByText("Upload chunk")).toHaveLength(2);
    expect(error.mock.calls.some((call) => String(call[0]).includes("same key"))).toBe(false);
    error.mockRestore();
  });
});

describe("StageList · hints and tone", () => {
  const STAGES_WITH_HINTS: ConversionStage[] = [
    { label: "Chunked upload", state: "active", time: "running", hint: "8 MB chunks, resumable" },
    { label: "Finalize blob", state: "pending", time: "queued", hint: "content hash written" },
  ];

  it("renders the hint under its stage's label", () => {
    render(<StageList stages={STAGES_WITH_HINTS} />);
    expect(screen.getByText("8 MB chunks, resumable")).toBeInTheDocument();
    expect(screen.getByText("content hash written")).toBeInTheDocument();
  });

  it("wraps the label and hint in a div, not a span — a <p> cannot nest in inline content", () => {
    render(<StageList stages={STAGES_WITH_HINTS} />);
    const hint = screen.getByText("8 MB chunks, resumable");
    expect(hint.parentElement!.tagName).toBe("DIV");
  });

  it("switches the active stage to accent when activeTone is accent", () => {
    render(<StageList stages={STAGES_WITH_HINTS} activeTone="accent" />);
    expect(screen.getByText("Chunked upload").className).toContain("text-accent");
  });

  it("keeps the warn default when activeTone is not given", () => {
    render(<StageList stages={STAGES_WITH_HINTS} />);
    expect(screen.getByText("Chunked upload").className).toContain("text-warn");
  });
});
