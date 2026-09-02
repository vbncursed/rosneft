import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    expect(screen.getByRole("list", { name: "Conversion stages" })).toBeInTheDocument();
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
});
